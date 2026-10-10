/**
 * Express app factory for the live teaching backend.
 *
 * Endpoints:
 *   GET  /healthz                     liveness probe (Railway)
 *   POST /api/live/session            mint a GPT-Live session (body: { sdp })
 *   POST /api/live/session/:id/close  graceful close of one session
 *
 * The factory takes its collaborators explicitly so tests can run the full
 * HTTP surface without network access.
 */
import express, { Express, NextFunction, Request, Response } from 'express';
import WebSocket from 'ws';
import { LiveBackendConfig } from './config';
import { LiveApiError, LiveSessionClient } from './liveClient';
import { recordLatency } from './metrics';
import { SessionRegistry } from './sessions';
import { SidebandConnection, WsFactory } from './sideband';
import { originCheck } from './middleware/originCheck';
import { rateLimit } from './middleware/rateLimit';

export interface ServerDeps {
  config: LiveBackendConfig;
  liveClient?: LiveSessionClient;
  registry?: SessionRegistry;
  wsFactory?: WsFactory;
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

export function createApp(deps: ServerDeps): Express {
  const { config } = deps;
  const liveClient = deps.liveClient ?? new LiveSessionClient({ apiKey: config.openaiApiKey });
  const registry = deps.registry ?? new SessionRegistry();
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
      const created = await liveClient.createSession({
        offerSdp,
        instructions: config.sessionInstructions,
        model: config.liveModel,
      });
      recordLatency('live.session.create_ms', created.durationMs);
      console.log(
        `[live] session created id=${created.sessionId} create_ms=${created.durationMs}`,
      );

      const sideband = new SidebandConnection({
        sessionId: created.sessionId,
        apiKey: config.openaiApiKey,
        baseUrl: config.liveApiBaseUrl,
        handlers: {
          onReady: (id) => console.log(`[live] session ${id} started (sideband ready)`),
          onTranscriptDelta: (id, speaker, delta) =>
            console.log(`[live] transcript ${id} ${speaker}: ${delta.slice(0, 120)}`),
          onClosed: (id, reason) => {
            console.log(`[live] session ${id} closed (reason=${reason ?? 'unknown'})`);
            void registry.closeSession(id).catch(() => undefined);
          },
          onError: (id, err) =>
            console.error(`[live] session ${id} sideband error:`, err),
          onInfo: (id, msg) => console.log(`[live] session ${id}: ${msg}`),
        },
        wsFactory,
        maxReconnectAttempts: config.maxReconnectAttempts,
      });
      sideband.attach();
      registry.register(created.sessionId, { sideband, createdAt: Date.now() });

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
    const closed = await registry.closeSession(id);
    if (!closed) {
      res.status(404).json({ error: 'unknown_session' });
      return;
    }
    res.json({ session: { id }, closed: true });
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
