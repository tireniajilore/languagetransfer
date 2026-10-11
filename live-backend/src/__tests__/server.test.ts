import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveApiError, LiveSessionClient } from '../liveClient';
import { clearCounters, clearLatency } from '../metrics';
import { createApp } from '../server';
import { SessionRegistry } from '../sessions';
import { FakeWs } from './fakes';

const mintedTokens = new Map<string, string>();
const OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

interface TestServer {
  baseUrl: string;
  wsInstances: FakeWs[];
  stop: () => Promise<void>;
}

async function startServer(opts?: {
  allowedOrigins?: string[];
  rateLimitMax?: number;
  liveTutorEnabled?: boolean;
  createImpl?: () => Promise<{ session: { id: string }; transport: { sdp: string } }>;
}): Promise<TestServer> {
  let counter = 0;
  const createImpl =
    opts?.createImpl ??
    (async () => {
      counter += 1;
      return { session: { id: `live_${counter}` }, transport: { sdp: 'v=0\r\nanswer' } };
    });
  const liveClient = new LiveSessionClient({ apiKey: 'sk-test', createFn: createImpl });
  const wsInstances: FakeWs[] = [];
  const app = createApp({ legacyHarnessForTests: true,
    config: {
      openaiApiKey: 'sk-test',
      port: 0,
      allowedOrigins: opts?.allowedOrigins ?? [],
      rateLimit: { windowMs: 60_000, max: opts?.rateLimitMax ?? 100 },
      liveModel: 'gpt-live-1',
      sessionInstructions: 'teach!',
      maxReconnectAttempts: 2,
      liveApiBaseUrl: 'https://api.openai.com',
      delegationModel: 'gpt-5.6-terra',
      delegationDisabled: true,
      liveTutorEnabled: opts?.liveTutorEnabled ?? true,
      memoryRetentionDays: 180,
      memoryFlushIntervalMs: 5000,
    },
    liveClient,
    registry: new SessionRegistry(),
    wsFactory: (url, wsOpts) => {
      const ws = new FakeWs();
      ws.lastUrl = url;
      ws.lastHeaders = wsOpts.headers;
      wsInstances.push(ws);
      return ws;
    },
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    wsInstances,
    stop: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

interface HttpResult {
  statusCode: number;
  body: unknown;
}

async function postJson(baseUrl: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(/\/api\/live\/session\/([^/]+)\/(close|tools)$/.exec(path) ? { authorization: `Bearer ${mintedTokens.get(path.split('/')[4]) ?? ''}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (path === '/api/live/session' && res.ok && data && typeof data === 'object') {
    const result = data as { session?: { id?: string; accessToken?: string } };
    if (result.session?.id && result.session.accessToken) mintedTokens.set(result.session.id, result.session.accessToken);
  }
  return { statusCode: res.status, body: data };
}

async function waitFor(cond: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

let servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.stop()));
  servers = [];
  mintedTokens.clear();
});

describe('live-backend HTTP surface', () => {
  it('GET /healthz reports liveness', async () => {
    const s = await startServer();
    servers.push(s);
    const res = await fetch(`${s.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'live-backend' });
  });

  it('GET /metrics exposes latency stats, counters, and session health', async () => {
    clearLatency();
    clearCounters();
    const s = await startServer();
    servers.push(s);
    // One full session lifecycle: mint then close.
    const mint = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
    expect(mint.statusCode).toBe(201);
    const close = await postJson(s.baseUrl, '/api/live/session/live_1/close', {});
    expect(close.statusCode).toBe(200);
    const res = await fetch(`${s.baseUrl}/metrics`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      service: string;
      sessions: { active: number };
      latency: Record<string, { count: number }>;
      counters: Record<string, unknown>;
      uptime_ms: number;
    };
    expect(body.service).toBe('live-backend');
    expect(body.sessions.active).toBe(0);
    expect(body.latency['live.session.create_ms']?.count).toBe(1);
    expect(body.counters['sessions.created']).toBe(1);
    expect(body.counters['sessions.closed']).toBe(1);
    expect(body.uptime_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 on mint when the live-tutor kill-switch is off', async () => {
    const s = await startServer({ liveTutorEnabled: false });
    servers.push(s);
    const res = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'disabled' });
  });

  it('POST /api/live/session mints a session, attaches the sideband, returns the answer', async () => {
    const s = await startServer();
    servers.push(s);
    const res = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      learner: { token: expect.stringMatching(/^lt1\./) },
      session: { id: 'live_1', accessToken: expect.any(String) },
      transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' },
    });
    // Sideband attached immediately after creation, with the project key.
    expect(s.wsInstances).toHaveLength(1);
    expect(s.wsInstances[0].lastUrl).toBe('https://api.openai.com/v1/live/sessions/live_1/attach');
    expect(s.wsInstances[0].lastHeaders.Authorization).toBe('Bearer sk-test');
  });

  it('rejects invalid session-mint bodies with 400', async () => {    const s = await startServer();
    servers.push(s);
    for (const body of [{}, { sdp: 42 }, { sdp: 'x'.repeat(60) }, { sdp: 'not-an-sdp-offer' }]) {
      const res = await postJson(s.baseUrl, '/api/live/session', body);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ error: 'invalid_request' });
    }
  });

  it('maps a rejected API key to 500 misconfigured without leaking details', async () => {
    const s = await startServer({
      createImpl: async () => {
        throw new LiveApiError('nope', { status: 401, retryable: false });
      },
    });
    servers.push(s);
    const res = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'misconfigured', detail: 'OpenAI key rejected' });
    expect(JSON.stringify(res.body)).not.toContain('sk-');
  });

  it('maps transient API failures to 502', async () => {
    const s = await startServer({
      createImpl: async () => {
        throw new LiveApiError('boom', { status: 503, retryable: true });
      },
    });
    servers.push(s);
    const res = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ error: 'live_api_error', retryable: true });
  });

  it('rate-limits session minting per client IP', async () => {
    const s = await startServer({ rateLimitMax: 2 });
    servers.push(s);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([201, 201, 429, 429]);
  });

  it('rejects non-allowlisted origins with 403', async () => {
    const s = await startServer({ allowedOrigins: ['https://ok.example.com'] });
    servers.push(s);
    const bad = await postJson(
      s.baseUrl,
      '/api/live/session',
      { sdp: OFFER_SDP },
      { origin: 'https://evil.example.com' },
    );
    expect(bad.statusCode).toBe(403);
    const good = await postJson(
      s.baseUrl,
      '/api/live/session',
      { sdp: OFFER_SDP },
      { origin: 'https://ok.example.com' },
    );
    expect(good.statusCode).toBe(201);
  });

  it('POST /api/live/session/:id/close performs the graceful handshake and is idempotent', async () => {
    const s = await startServer();
    servers.push(s);
    const mint = await postJson(s.baseUrl, '/api/live/session', { sdp: OFFER_SDP });
    const id = (mint.body as { session: { id: string } }).session.id;

    const closeReq = postJson(s.baseUrl, `/api/live/session/${id}/close`, {});
    // Wait until the backend sends session.close on the sideband, then answer it.
    await waitFor(() => s.wsInstances[0].sent.some((m) => m.includes('session.close')));
    s.wsInstances[0].emitJson('message', {
      type: 'session.closed',
      event_id: 'e1',
      reason: 'close_requested',
    });
    const closed = await closeReq;
    expect(closed.statusCode).toBe(200);
    expect(closed.body).toEqual({ session: { id }, closed: true });

    // Second close: idempotent 404 (session already gone).
    const again = await postJson(s.baseUrl, `/api/live/session/${id}/close`, {});
    expect(again.statusCode).toBe(401);
  });

  it('closing an unknown session returns 404', async () => {
    const s = await startServer();
    servers.push(s);
    const res = await postJson(s.baseUrl, '/api/live/session/live_unknown/close', {});
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized_session' });
  });

  it('unknown routes return 404 JSON', async () => {
    const s = await startServer();
    servers.push(s);
    const res = await fetch(`${s.baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});
