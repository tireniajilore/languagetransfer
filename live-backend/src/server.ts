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
import { randomBytes } from 'node:crypto';
import { CourseStore, CourseLockedError } from './lessons/courseStore';
import { getTeachingSpec } from './lessons/teachingSpec';
import {
  ModelTeachingSupervisor,
  type TeachingSupervisor,
} from './lessons/supervisor';
import { TeachingConflictError } from './lessons/checkpointStore';
import { z } from 'zod';
import {
  LessonSessionManager,
  lessonInstructions,
} from './lessons/sessionManager';
import WebSocket from 'ws';
import { DEFAULT_CURRICULUM, Curriculum } from './curriculum';
import { assembleTeachingContext } from './harness/context';
import { HarnessObserver } from './harness/observer';
import {
  DispatchResult,
  HarnessStore,
  ToolErrorCode,
  ToolRouter,
} from './harness/tools';
import {
  buildDelegationConfig,
  DelegationManager,
} from './reasoning/delegation';
import { GuardrailMonitor, GuardrailTrigger } from './reasoning/guardrails';
import { analyzeResponse } from './reasoning/analysis';
import { currentQuestionTarget } from './harness/questionTarget';
import { LiveBackendConfig } from './config';
import { resolveLearnerIdentity } from './memory/learnerIdentity';
import { LiveApiError, LiveSessionClient } from './liveClient';
import { recordCounter, recordLatency, summarizeMetrics } from './metrics';
import { SessionRegistry } from './sessions';
import { SidebandConnection, WsFactory } from './sideband';
import { originCheck } from './middleware/originCheck';
import { corsPreflight } from './middleware/cors';
import { rateLimit } from './middleware/rateLimit';

/** Teaching-harness collaborators (Layer B). Built by default from the curriculum. */
export interface HarnessDeps {
  curriculum: Curriculum;
  store: HarnessStore;
  router: ToolRouter;
  observer: HarnessObserver;
}

export function createHarnessDeps(
  curriculum: Curriculum = DEFAULT_CURRICULUM,
  store: HarnessStore = new HarnessStore(),
): HarnessDeps {
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
  courseStore?: CourseStore;
  supervisor?: TeachingSupervisor;
  /** Explicit fixture-only compatibility; production entry point never enables this. */
  legacyHarnessForTests?: boolean;
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
function parseMintOptions(body: unknown): {
  objectiveId?: string;
  learnerToken?: string;
  lessonNumber?: number;
} {
  if (!body || typeof body !== 'object') return {};
  const b = body as {
    objectiveId?: unknown;
    learnerToken?: unknown;
    lessonNumber?: unknown;
  };
  const clean = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 && v.length <= 128 ? v : undefined;
  // An untrusted caller cannot choose a durable learner identity.
  return {
    objectiveId: clean(b.objectiveId),
    lessonNumber:
      typeof b.lessonNumber === 'number' && Number.isInteger(b.lessonNumber)
        ? b.lessonNumber
        : undefined,
    learnerToken:
      typeof b.learnerToken === 'string' && b.learnerToken.length < 256
        ? b.learnerToken
        : undefined,
  };
}

/**
 * Layer C fast-path analysis on each completed learner utterance.
 *
 * Deterministic scoring runs first (no model): correct/unclear answers and
 * registered misconceptions are recorded as evidence immediately, off the
 * conversational critical path. Unfamiliar wrong answers are logged for the
 * delegated reasoning path — the voice model delegates through the Live
 * session when it needs deeper analysis.
 *
 * Expected answers default to the current concept's verified examples (the
 * teaching material); the leak guard registers them as live targets so the
 * assistant cannot blurt them before the learner derives them.
 */
function analyzeUserTurn(
  harness: HarnessDeps,
  sessionId: string,
  text: string,
  guardrails: GuardrailMonitor,
): void {
  const state = harness.store.get(sessionId);
  if (!state) return;
  const target = currentQuestionTarget(harness.curriculum, state);
  if (!target) return; // unanchored Live speech cannot be scored as mastery evidence
  const { conceptId, expectedAnswers } = target;
  guardrails.registerLiveTargets(sessionId, conceptId, expectedAnswers);

  const result = analyzeResponse({
    curriculum: harness.curriculum,
    state,
    utterance: text,
    conceptId,
    expectedAnswers,
  });
  console.log(
    `[live] analysis session=${sessionId} concept=${conceptId} outcome=${result.match.outcome} path=${result.path} — ${result.rationale}`,
  );

  if (result.path === 'reasoning') {
    // The delegated backend model picks this up via the Live session's
    // delegation mechanism; nothing deterministic to record beyond the
    // incorrect evidence below.
  }
  if (!result.evidenceKind || result.evidenceKind === 'utterance') return;
  const dispatch = harness.router.dispatch({
    sessionId,
    tool: 'assess_understanding',
    input: {
      turnId: state.turn,
      conceptId,
      evidence: {
        kind:
          target.kind === 'transfer' && result.evidenceKind === 'correct'
            ? 'transfer_pass'
            : target.kind === 'transfer' && result.evidenceKind === 'incorrect'
              ? 'transfer_fail'
              : result.evidenceKind,
        detail: `learner said: ${text.slice(0, 300)}`,
        ...(result.misconceptionId
          ? { misconceptionId: result.misconceptionId }
          : {}),
      },
    },
  });
  if (!dispatch.ok) {
    console.error(
      `[live] analysis evidence rejected session=${sessionId}: ${dispatch.error?.code} ${dispatch.error?.detail ?? ''}`,
    );
  }
}
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
  const liveClient =
    deps.liveClient ?? new LiveSessionClient({ apiKey: config.openaiApiKey });
  const registry = deps.registry ?? new SessionRegistry();
  const harness = deps.harness ?? createHarnessDeps();
  const course = new LessonSessionManager(
    deps.courseStore ?? new CourseStore(),
    deps.supervisor ??
      new ModelTeachingSupervisor(config.openaiApiKey, config.delegationModel),
  );
  // Without Postgres this identity survives only until this backend restarts.
  const courseSecret =
    config.learnerTokenSecret ?? randomBytes(32).toString('hex');
  const readyLessons = new Set<string>();
  const wsFactory: WsFactory =
    deps.wsFactory ?? ((url, opts) => new WebSocket(url, opts) as never);

  // GPT-Live does not automatically know the authoritative learner state.
  // Push compact, application-owned context whenever a committed teaching
  // action changes it. Sideband readiness and initialization can race.
  const publishedContext = new Map<string, string>();
  const publishContext = (sessionId: string): void => {
    const state = harness.store.get(sessionId);
    const sideband = registry.get(sessionId)?.sideband;
    if (!state || !sideband || sideband.getState() !== 'open') return;
    if (course.has(sessionId)) return; // lesson-specific instructions replace the generic concept plan
    const context = assembleTeachingContext(harness.curriculum, state);
    const target = currentQuestionTarget(harness.curriculum, state);
    if (target)
      registry
        .get(sessionId)
        ?.guardrails?.registerLiveTargets(
          sessionId,
          target.conceptId,
          target.expectedAnswers,
        );
    if (publishedContext.get(sessionId) === context.rendered) return;
    try {
      sideband.sendCommand({
        type: 'session.thinking.append',
        event_id: `context_${randomBytes(8).toString('hex')}`,
        delegation_id: null,
        content:
          'Current authoritative teaching plan (supersedes earlier state):\\n' +
          context.rendered,
      });
      publishedContext.set(sessionId, context.rendered);
    } catch (err) {
      console.warn(
        '[live] could not synchronize teaching context',
        sessionId,
        err,
      );
    }
  };
  harness.router.onWrite(publishContext);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'live-backend',
      sessions: registry.size,
    });
  });

  /**
   * Operational summary (PR 5): latency histograms (p50/p95/max), event
   * counters (sessions, delegations, guardrail triggers, teaching moves),
   * and session health. In-memory since process start; no PII — safe to
   * expose without auth on the trusted service network.
   */
  app.get('/metrics', (_req: Request, res: Response) => {
    res.json({
      service: 'live-backend',
      sessions: { active: registry.size },
      ...summarizeMetrics(),
    });
  });

  const requireSessionAccess = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const id = req.params.id;
    const authorization = req.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    if (!id || !registry.authorize(id, token)) {
      res.status(401).json({ error: 'unauthorized_session' });
      return;
    }
    next();
  };

  const mintGuards = [
    originCheck(config.allowedOrigins),
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
    }),
  ];

  // CORS preflight must be answered before any route handling: browsers send
  // OPTIONS ahead of the cross-origin JSON POSTs the /live frontend makes.
  // Without this the preflight 404s and the UI reports "Failed to fetch".
  app.use('/api', corsPreflight(config.allowedOrigins));

  /** An anonymous possession capability identifies this browser's saved course. */
  app.get('/api/live/course', async (req: Request, res: Response) => {
    try {
      const raw = req.get('authorization') ?? '';
      const learner = resolveLearnerIdentity(
        raw.startsWith('Bearer ') ? raw.slice(7) : null,
        courseSecret,
      );
      const lessons = await course.courseStore.overview(learner.learnerId);
      res.json({ learnerToken: learner.token, lessons });
    } catch (err) {
      console.error('[live] course overview failed', err);
      res.status(503).json({ error: 'course_unavailable' });
    }
  });

  app.post(
    '/api/live/session',
    ...mintGuards,
    async (req: Request, res: Response) => {
      // PR 5 kill-switch: refuse to mint while the feature is disabled.
      if (!config.liveTutorEnabled) {
        res.status(503).json({
          error: 'disabled',
          detail: 'live tutor is disabled (LIVE_TUTOR_ENABLED=0)',
        });
        return;
      }
      const offerSdp = validateOfferSdp(req.body);
      if (!offerSdp) {
        res.status(400).json({
          error: 'invalid_request',
          detail: 'body.sdp must be an SDP offer string',
        });
        return;
      }
      try {
        const suppliedLesson = (req.body as { lessonNumber?: unknown })
          .lessonNumber;
        if (
          suppliedLesson !== undefined &&
          (typeof suppliedLesson !== 'number' ||
            !Number.isInteger(suppliedLesson) ||
            suppliedLesson < 2 ||
            suppliedLesson > 90)
        ) {
          res.status(400).json({ error: 'invalid_lesson_number' });
          return;
        }
        const mintOptions = parseMintOptions(req.body);
        const lessonNumber = mintOptions.lessonNumber ?? (deps.legacyHarnessForTests ? undefined : 2);
        const courseBound = lessonNumber !== undefined;
        const learner = resolveLearnerIdentity(
          mintOptions.learnerToken,
          courseSecret,
        );
        let activeLesson: ReturnType<typeof getTeachingSpec> | undefined;
        if (courseBound) {
          try {
            await course.courseStore.requireUnlocked(
              learner.learnerId,
              lessonNumber,
            );
            activeLesson = getTeachingSpec(lessonNumber);
            if (activeLesson.reviewStatus !== 'transcript-audited') {
              res.status(503).json({
                error: 'lesson_not_reviewed',
                detail:
                  'Supervised teaching is being validated on Lesson 2 first.',
              });
              return;
            }
          } catch (err) {
            if (err instanceof CourseLockedError) {
              res
                .status(423)
                .json({ error: 'lesson_locked', detail: err.message });
              return;
            }
            throw err;
          }
        }
        // Layer C: Responses delegation is configured at session creation so the
        // voice model can delegate deep pedagogical reasoning to the backend.
        const delegation = courseBound
          ? { type: 'client' as const }
          : config.delegationDisabled
            ? undefined
            : buildDelegationConfig(harness.curriculum, {
                model: config.delegationModel,
              });
        const created = await liveClient.createSession({
          offerSdp,
          instructions: activeLesson
            ? lessonInstructions(
                activeLesson.number,
                config.sessionInstructions,
              )
            : config.sessionInstructions,
          model: config.liveModel,
          delegation,
        });
        recordLatency('live.session.create_ms', created.durationMs);
        recordCounter('sessions.created');
        console.log(
          `[live] session created id=${created.sessionId} create_ms=${created.durationMs} delegation=${delegation?.type ?? 'disabled'}`,
        );

        // Per-session Layer C collaborators. sidebandRef lets handlers send
        // commands on the socket after it is created.
        let sidebandRef: SidebandConnection | null = null;
        const sendCommand = (command: Record<string, unknown>): void => {
          try {
            sidebandRef?.sendCommand(command);
          } catch (err) {
            console.error(
              `[live] session ${created.sessionId} sendCommand failed:`,
              err instanceof Error ? err.message : err,
            );
          }
        };
        const delegationManager =
          delegation?.type === 'responses'
            ? new DelegationManager({
                router: harness.router,
                store: harness.store,
                sender: { sendCommand },
                log: (message, fields) =>
                  console.log(
                    JSON.stringify({
                      component: 'delegation',
                      message,
                      ...fields,
                    }),
                  ),
              })
            : null;
        const guardrails = new GuardrailMonitor({
          store: harness.store,
          curriculum: harness.curriculum,
          sendCommand,
          onTrigger: (trigger: GuardrailTrigger) =>
            onGuardrailTrigger(created.sessionId, trigger, delegationManager),
          onUserTurn: (sessionId, text) => {
            if (!course.has(sessionId)) {
              analyzeUserTurn(harness, sessionId, text, guardrails);
              return;
            }
          },
        });

        const sideband = new SidebandConnection({
          sessionId: created.sessionId,
          apiKey: config.openaiApiKey,
          baseUrl: config.liveApiBaseUrl,
          handlers: {
            onReady: (id) => {
              console.log(`[live] session ${id} started (sideband ready)`);
              readyLessons.add(id);
              course.get(id)?.setControlReady(true);
              publishContext(id);
            },
            onTranscriptDelta: (id, speaker, delta, event) => {
              console.log(
                `[live] transcript ${id} ${speaker}: ${delta.slice(0, 120)}`,
              );
              harness.observer.onTranscriptDelta(id, speaker, delta);
              if (course.has(id))
                course.get(id)?.onFragment(speaker, { ...event, delta });
              else guardrails.onTranscriptDelta(id, speaker, delta);
            },
            onEvent: (id, event) => course.get(id)?.onEvent(event),
            onStateChange: (id, state) => {
              if (state !== 'open' && state !== 'connecting')
                course.get(id)?.setControlReady(false);
            },
            onDelegationEvent: (id, event) => {
              if (!course.has(id)) delegationManager?.handleEvent(id, event);
            },
            onClosed: (id, reason) => {
              console.log(
                `[live] session ${id} closed (reason=${reason ?? 'unknown'})`,
              );
              harness.observer.onSessionClosed(id);
              guardrails.flush(id);
              publishedContext.delete(id);
              readyLessons.delete(id);
              void course
                .forgetSession(id)
                .catch((err) => console.error('[lesson] close failed', err));
              delegationManager?.setToolBlock(id, false);
              void registry.closeSession(id).catch(() => undefined);
            },
            onError: (id, err) => {
              recordCounter('sessions.errored');
              console.error(`[live] session ${id} sideband error:`, err);
            },
            onInfo: (id, msg) => console.log(`[live] session ${id}: ${msg}`),
          },
          wsFactory,
          maxReconnectAttempts: config.maxReconnectAttempts,
        });
        sidebandRef = sideband;
        sideband.attach();
        const accessToken = registry.register(created.sessionId, {
          sideband,
          createdAt: Date.now(),
          ...(delegationManager ? { delegation: delegationManager } : {}),
          guardrails,
        });

        if (courseBound && activeLesson) {
          try {
            const runtime = await course.prepare(
              created.sessionId,
              learner.learnerId,
              activeLesson.number,
              {
                send: (command) => sideband.sendCommand(command),
                fail: (error) => {
                  console.error(
                    '[lesson] terminating uncontrolled session',
                    error,
                  );
                  if (sideband.getState() === 'open') {
                    try { sideband.sendCommand({ type: 'session.close' }); } catch { /* primary channel will close on heartbeat failure */ }
                  }
                  sideband.destroy();
                },
              },
            );
            runtime.setControlReady(
              readyLessons.has(created.sessionId) &&
                sideband.getState() === 'open',
            );
          } catch (error) {
            sideband.destroy();
            if (error instanceof TeachingConflictError) {
              res.status(409).json({ error: 'lesson_already_active' });
              return;
            }
            throw error;
          }
        }
        // Initialize authoritative teaching state for this session (Layer B).
        // A harness failure must not kill the voice session, so it is logged
        // and the session continues without teaching state.
        try {
          const { objectiveId } = mintOptions;
          // prepareSession restores prior learner knowledge when the store is
          // persistent (Layer D) and falls back to a fresh state otherwise.
          const state = await harness.store.prepareSession({
            sessionId: created.sessionId,
            curriculum: harness.curriculum,
            objectiveId,
            learnerId: learner.learnerId,
          });
          publishContext(created.sessionId);
          console.log(
            `[live] harness initialized session=${created.sessionId} objective=${state.currentObjectiveId} learner=signed-anonymous`,
          );
        } catch (err) {
          console.error(
            `[live] harness init failed for session ${created.sessionId}:`,
            err instanceof Error ? err.message : err,
          );
          // A course session without authoritative state must never fall back
          // to free-form tutoring; revoke it instead of presenting a fake lesson.
          if (courseBound) {
            await course.forgetSession(created.sessionId);
            readyLessons.delete(created.sessionId);
            void registry
              .closeSession(created.sessionId)
              .catch(() => undefined);
            res.status(503).json({ error: 'lesson_state_unavailable' });
            return;
          }
        }

        res.status(201).json({
          session: { id: created.sessionId, accessToken },
          learner: { token: learner.token },
          transport: { type: 'webrtc', sdp: created.answerSdp },
        });
      } catch (err) {
        if (err instanceof LiveApiError) {
          if (!err.retryable && (err.status === 401 || err.status === 403)) {
            console.error(
              '[live] session creation failed: API key rejected (check OPENAI_API_KEY / GPT-Live access)',
            );
            res
              .status(500)
              .json({ error: 'misconfigured', detail: 'OpenAI key rejected' });
            return;
          }
          console.error(`[live] session creation failed: ${err.message}`);
          res
            .status(502)
            .json({ error: 'live_api_error', retryable: err.retryable });
          return;
        }
        console.error('[live] unexpected session creation error:', err);
        res.status(500).json({ error: 'internal_error' });
      }
    },
  );

  app.post(
    '/api/live/session/:id/start',
    requireSessionAccess,
    async (req: Request, res: Response) => {
      const id = req.params.id;
      const sideband = registry.get(id)?.sideband;
      if (!course.has(id)) {
        res.status(404).json({ error: 'unknown_lesson' });
        return;
      }
      if (
        !sideband ||
        sideband.getState() !== 'open' ||
        !readyLessons.has(id)
      ) {
        res.status(409).json({ error: 'session_not_ready' });
        return;
      }
      try {
        await course.get(id)!.start();
        res.json({ started: true });
      } catch (err) {
        console.error('[lesson] start failed', err);
        sideband.destroy();
        res.status(503).json({ error: 'lesson_start_failed' });
      }
    },
  );

  app.get(
    '/api/live/session/:id/progress',
    requireSessionAccess,
    (req: Request, res: Response) => {
      const lesson = course.get(req.params.id);
      if (!lesson) {
        res.status(404).json({ error: 'unknown_lesson' });
        return;
      }
      const totalSteps = lesson.spec.steps.length;
      res.json({
        ...lesson.cursor,
        totalSteps,
        reviewStatus: lesson.spec.reviewStatus,
        completed:
          lesson.cursor.phase === 'completed' &&
          lesson.cursor.stepIndex === totalSteps,
      });
    },
  );

  const ActivitySchema = z
    .object({
      speaker: z.enum(['user', 'assistant']),
      speaking: z.boolean(),
      seq: z.number().int().nonnegative(),
      playing: z.boolean().optional(),
      outputEventId: z.string().max(200).optional(),
    })
    .strict();
  app.post(
    '/api/live/session/:id/activity',
    requireSessionAccess,
    async (req: Request, res: Response) => {
      const lesson = course.get(req.params.id);
      if (!lesson) {
        res.status(404).json({ error: 'unknown_lesson' });
        return;
      }
      const parsed = ActivitySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_activity' });
        return;
      }
      try {
        await lesson.activity(parsed.data);
        res.json({ ok: true });
      } catch (error) {
        console.error('[lesson] activity failed', error);
        registry.get(req.params.id)?.sideband.destroy();
        res.status(503).json({ error: 'teaching_unavailable' });
      }
    },
  );
  app.get(
    '/api/live/session/:id/trace',
    requireSessionAccess,
    (req: Request, res: Response) => {
      const lesson = course.get(req.params.id);
      if (!lesson) {
        res.status(404).json({ error: 'unknown_lesson' });
        return;
      }
      res.json({
        specification: lesson.spec,
        version: lesson.spec.version,
        reviewStatus: lesson.spec.reviewStatus,
        state: lesson.cursor,
        events: lesson.audit,
      });
    },
  );

  app.post(
    '/api/live/session/:id/close',
    requireSessionAccess,
    async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id || id.length > 128) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      harness.observer.onSessionClosed(id);
      publishedContext.delete(id);
      readyLessons.delete(id);
      await course.forgetSession(id);
      const closed = await registry.closeSession(id);
      if (!closed) {
        res.status(404).json({ error: 'unknown_session' });
        return;
      }
      // Flush-on-close: no learner progress is lost when the session ends.
      await harness.store.flush();
      recordCounter('sessions.closed');
      res.json({ session: { id }, closed: true });
    },
  );

  /**
   * Dispatch a harness tool call (Layer B). Used by tests, the debug UI, and
   * — from PR 3 — the Responses-delegation tool executor. Error codes map to
   * HTTP status: unknown_tool/invalid_input -> 400, unknown_session -> 404,
   * stale_turn/invalid_move/session_not_active -> 409, internal -> 500.
   */
  app.post(
    '/api/live/session/:id/tools',
    requireSessionAccess,
    (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id || id.length > 128) {
        res.status(400).json({
          ok: false,
          error: { code: 'invalid_input', detail: 'bad session id' },
        });
        return;
      }
      if (course.has(id)) {
        res.status(409).json({ error: 'lesson_conductor_only' });
        return;
      }
      const body = (req.body ?? {}) as {
        tool?: unknown;
        input?: unknown;
        idempotencyKey?: unknown;
      };
      const dispatchResult: DispatchResult = harness.router.dispatch({
        sessionId: id,
        tool: typeof body.tool === 'string' ? body.tool : '',
        input: {
          ...(body.input &&
          typeof body.input === 'object' &&
          !Array.isArray(body.input)
            ? body.input
            : {}),
          sessionId: id,
        },
        idempotencyKey:
          typeof body.idempotencyKey === 'string'
            ? body.idempotencyKey
            : undefined,
      });
      if (dispatchResult.ok) {
        res.json({ ok: true, result: dispatchResult.result });
        return;
      }
      const code: ToolErrorCode =
        dispatchResult.error?.code ?? 'internal_error';
      const status =
        code === 'unknown_session'
          ? 404
          : code === 'stale_turn' ||
              code === 'invalid_move' ||
              code === 'session_not_active'
            ? 409
            : code === 'internal_error'
              ? 500
              : 400;
      res.status(status).json({ ok: false, error: dispatchResult.error });
    },
  );

  /** Read the assembled teaching context for a session (debug / UI). */
  app.get(
    '/api/live/session/:id/context',
    requireSessionAccess,
    (req: Request, res: Response) => {
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
    },
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[live] unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
