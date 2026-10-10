/**
 * Express app factory for the live teaching backend.
 *
 * Endpoints:
 *   GET  /healthz                     liveness probe (Railway)
 *   POST /api/live/session            mint a GPT-Live session (body: { sdp, learnerId?, objectiveId? })
 *   POST /api/live/session/:id/close  graceful close of one session
 *   POST /api/live/session/:id/tools  dispatch a harness tool call (body: { tool, input, idempotencyKey? })
 *   GET  /api/live/session/:id/context  read the assembled teaching context
 *
 * The factory takes its collaborators explicitly so tests can run the full
 * HTTP surface without network access.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import WebSocket from 'ws';
import { DEFAULT_CURRICULUM, Curriculum } from './curriculum';
import { assembleTeachingContext } from './harness/context';
import { HarnessObserver } from './harness/observer';
import { createHarnessState } from './harness/stateMachine';
import { DispatchResult, HarnessStore, ToolErrorCode, ToolRouter } from './harness/tools';
import { buildDelegationConfig, DelegationManager } from './reasoning/delegation';
import { GuardrailMonitor, GuardrailTrigger } from './reasoning/guardrails';
import { LiveBackendConfig } from './config';
import { LiveApiError, LiveSessionClient } from './liveClient';
import { recordLatency } from './metrics';
import { SessionRegistry } from './sessions';
import { SidebandConnection, WsFactory } from './sideband';
import { originCheck } from './middleware/originCheck';
import { rateLimit } from './middleware/rateLimit';

/** Teaching-harness collaborators (Layer B). Built by default from the curriculum. */
export interface HarnessDeps {
  curriculum: Curriculum;
  store: HarnessStore;
  router: ToolRouter;
  observer: HarnessObserver;
}

export function createHarnessDeps(curriculum: Curriculum = DEFAULT_CURRICULUM): HarnessDeps {
  const store = new HarnessStore();
  const router = new ToolRouter({ store, curriculum, now: () => Date.now() });
  const observer = new HarnessObserver(store, curriculum);
  return { curriculum, store, router, observer };
}

export interface ServerDeps {
  config: LiveBackendConfig;
  liveClient?: LiveSessionClient;
  registry?: SessionRegistry;
  wsFactory?: WsFactory;
  harness?: HarnessDeps;
}

const MAX_SDP_BYTES = 200_000;
const MIN_SDP_BYTES = 50;

function validateOfferSdp(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const sdp = (body as { sdp?: unknown }).sdp;
  if (typeof sdp !== 'string') return null;
  if (sdp.length < MIN_SDP_BYTES || sdp.length > MAX_SDP_BYTES) return null;
  if (!sdp.includes('v=0')) return null; // SDP offers start with v=0
  return sdp;
}

/** Optional mint parameters: learner identity + starting objective. */
function parseMintOptions(body: unknown): { learnerId?: string; objectiveId?: string } {
  if (!body || typeof body !== 'object') return {};
  const b = body as { learnerId?: unknown; objectiveId?: unknown };
  const clean = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 && v.length <= 128 ? v : undefined;
  return { learnerId: clean(b.learnerId), objectiveId: clean(b.objectiveId) };
}

/**
 * Guardrail trigger policy (ADR-001 D4, evaluated + interruptive control).
 * Every trigger is logged with session id. The monitor already sent a
 * corrective `session.instructions.append`; here we additionally block
 * write-tool execution briefly so the delegated backend cannot compound the
 * violation by committing moves off the offending content.
 */
function onGuardrailTrigger(
  sessionId: string,
  trigger: GuardrailTrigger,
  delegationManager: DelegationManager | null,
): void {
  console.log(
    JSON.stringify({
      component: 'guardrails',
      event: 'trigger',
      sessionId,
      kind: trigger.kind,
      detail: trigger.detail,
      excerpt: trigger.excerpt,
      at: trigger.at,
    }),
  );
  delegationManager?.setToolBlock(sessionId, true);
}

export function createApp(deps: ServerDeps): Express {
  const { config } = deps;
  const liveClient = deps.liveClient ?? new LiveSessionClient({ apiKey: config.openaiApiKey });
  const registry = deps.registry ?? new SessionRegistry();
  const harness = deps.harness ?? createHarnessDeps();
  const wsFactory: WsFactory =
    deps.wsFactory ?? ((url, opts) => new WebSocket(url, opts) as never);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'live-backend', sessions: registry.size });
  });

  const mintGuards = [
    originCheck(config.allowedOrigins),
    rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
  ];

  app.post('/api/live/session', ...mintGuards, async (req: Request, res: Response) => {
    const offerSdp = validateOfferSdp(req.body);
    if (!offerSdp) {
      res.status(400).json({ error: 'invalid_request', detail: 'body.sdp must be an SDP offer string' });
      return;
    }
    try {
      // Layer C: Responses delegation is configured at session creation so the
      // voice model can delegate deep pedagogical reasoning to the backend.
      const delegation = config.delegationDisabled
        ? undefined
        : buildDelegationConfig(harness.curriculum, { model: config.delegationModel });
      const created = await liveClient.createSession({
        offerSdp,
        instructions: config.sessionInstructions,
        model: config.liveModel,
        delegation,
      });
      recordLatency('live.session.create_ms', created.durationMs);
      console.log(
        `[live] session created id=${created.sessionId} create_ms=${created.durationMs} delegation=${delegation ? config.delegationModel : 'disabled'}`,
      );

      // Per-session Layer C collaborators. sidebandRef lets handlers send
      // commands on the socket after it is created.
      let sidebandRef: SidebandConnection | null = null;
      const sendCommand = (command: Record<string, unknown>): void => {
        try {
          sidebandRef?.sendCommand(command);
        } catch (err) {
          console.error(`[live] session ${created.sessionId} sendCommand failed:`, err instanceof Error ? err.message : err);
        }
      };
      const delegationManager = delegation
        ? new DelegationManager({
            router: harness.router,
            store: harness.store,
            sender: { sendCommand },
            log: (message, fields) =>
              console.log(JSON.stringify({ component: 'delegation', message, ...fields })),
          })
        : null;
      const guardrails = new GuardrailMonitor({
        store: harness.store,
        curriculum: harness.curriculum,
        sendCommand,
        onTrigger: (trigger: GuardrailTrigger) =>
          onGuardrailTrigger(created.sessionId, trigger, delegationManager),
      });

      const sideband = new SidebandConnection({
        sessionId: created.sessionId,
        apiKey: config.openaiApiKey,
        baseUrl: config.liveApiBaseUrl,
        handlers: {
          onReady: (id) => console.log(`[live] session ${id} started (sideband ready)`),
          onTranscriptDelta: (id, speaker, delta) => {
            console.log(`[live] transcript ${id} ${speaker}: ${delta.slice(0, 120)}`);
            harness.observer.onTranscriptDelta(id, speaker, delta);
            guardrails.onTranscriptDelta(id, speaker, delta);
          },
          onDelegationEvent: (id, event) => delegationManager?.handleEvent(id, event),
          onClosed: (id, reason) => {
            console.log(`[live] session ${id} closed (reason=${reason ?? 'unknown'})`);
            harness.observer.onSessionClosed(id);
            guardrails.flush(id);
            delegationManager?.setToolBlock(id, false);
            void registry.closeSession(id).catch(() => undefined);
          },
          onError: (id, err) =>
            console.error(`[live] session ${id} sideband error:`, err),
          onInfo: (id, msg) => console.log(`[live] session ${id}: ${msg}`),
        },
        wsFactory,
        maxReconnectAttempts: config.maxReconnectAttempts,
      });
      sidebandRef = sideband;
      sideband.attach();
      registry.register(created.sessionId, {
        sideband,
        createdAt: Date.now(),
        ...(delegationManager ? { delegation: delegationManager } : {}),
        guardrails,
      });

      // Initialize authoritative teaching state for this session (Layer B).
      // A harness failure must not kill the voice session, so it is logged
      // and the session continues without teaching state.
      try {
        const { learnerId, objectiveId } = parseMintOptions(req.body);
        harness.store.insert(
          createHarnessState({
            sessionId: created.sessionId,
            curriculum: harness.curriculum,
            learnerId,
            objectiveId,
          }),
        );
        console.log(
          `[live] harness initialized session=${created.sessionId} objective=${objectiveId ?? 'default'}`,
        );
      } catch (err) {
        console.error(
          `[live] harness init failed for session ${created.sessionId}:`,
          err instanceof Error ? err.message : err,
        );
      }

      res.status(201).json({
        session: { id: created.sessionId },
        transport: { type: 'webrtc', sdp: created.answerSdp },
      });
    } catch (err) {
      if (err instanceof LiveApiError) {
        if (!err.retryable && (err.status === 401 || err.status === 403)) {
          console.error('[live] session creation failed: API key rejected (check OPENAI_API_KEY / GPT-Live access)');
          res.status(500).json({ error: 'misconfigured', detail: 'OpenAI key rejected' });
          return;
        }
        console.error(`[live] session creation failed: ${err.message}`);
        res.status(502).json({ error: 'live_api_error', retryable: err.retryable });
        return;
      }
      console.error('[live] unexpected session creation error:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/live/session/:id/close', async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id || id.length > 128) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    harness.observer.onSessionClosed(id);
    const closed = await registry.closeSession(id);
    if (!closed) {
      res.status(404).json({ error: 'unknown_session' });
      return;
    }
    res.json({ session: { id }, closed: true });
  });

  /**
   * Dispatch a harness tool call (Layer B). Used by tests, the debug UI, and
   * — from PR 3 — the Responses-delegation tool executor. Error codes map to
   * HTTP status: unknown_tool/invalid_input -> 400, unknown_session -> 404,
   * stale_turn/invalid_move/session_not_active -> 409, internal -> 500.
   */
  app.post('/api/live/session/:id/tools', (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id || id.length > 128) {
      res.status(400).json({ ok: false, error: { code: 'invalid_input', detail: 'bad session id' } });
      return;
    }
    const body = (req.body ?? {}) as { tool?: unknown; input?: unknown; idempotencyKey?: unknown };
    const dispatchResult: DispatchResult = harness.router.dispatch({
      sessionId: id,
      tool: typeof body.tool === 'string' ? body.tool : '',
      input: body.input ?? {},
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
    });
    if (dispatchResult.ok) {
      res.json({ ok: true, result: dispatchResult.result });
      return;
    }
    const code: ToolErrorCode = dispatchResult.error?.code ?? 'internal_error';
    const status =
      code === 'unknown_session'
        ? 404
        : code === 'stale_turn' || code === 'invalid_move' || code === 'session_not_active'
          ? 409
          : code === 'internal_error'
            ? 500
            : 400;
    res.status(status).json({ ok: false, error: dispatchResult.error });
  });

  /** Read the assembled teaching context for a session (debug / UI). */
  app.get('/api/live/session/:id/context', (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id || id.length > 128) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const state = harness.store.get(id);
    if (!state) {
      res.status(404).json({ error: 'unknown_session' });
      return;
    }
    res.json(assembleTeachingContext(harness.curriculum, state));
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[live] unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
