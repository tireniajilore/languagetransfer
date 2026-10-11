import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveSessionClient } from '../liveClient';
import { createApp, createHarnessDeps } from '../server';
import { SessionRegistry } from '../sessions';
import { FakeWs } from './fakes';

const mintedTokens = new Map<string, string>();
const OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

interface TestServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

async function startServer(): Promise<TestServer> {
  let counter = 0;
  const liveClient = new LiveSessionClient({
    apiKey: 'sk-test',
    createFn: async () => {
      counter += 1;
      return { session: { id: `live_h${counter}` }, transport: { sdp: 'v=0\r\nanswer' } };
    },
  });
  const app = createApp({
    config: {
      openaiApiKey: 'sk-test',
      port: 0,
      allowedOrigins: [],
      rateLimit: { windowMs: 60_000, max: 100 },
      liveModel: 'gpt-live-1',
      sessionInstructions: 'teach!',
      maxReconnectAttempts: 2,
      liveApiBaseUrl: 'https://api.openai.com',
      delegationModel: 'gpt-5.6-terra',
      delegationDisabled: true,
      liveTutorEnabled: true,
      memoryRetentionDays: 180,
      memoryFlushIntervalMs: 5000,
    },
    liveClient,
    registry: new SessionRegistry(),
    harness: createHarnessDeps(),
    wsFactory: () => new FakeWs(),
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(/\/api\/live\/session\/([^/]+)\/tools$/.exec(path) ? { authorization: `Bearer ${mintedTokens.get(path.split('/')[4]) ?? ''}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function mint(baseUrl: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { status, body } = await postJson(baseUrl, '/api/live/session', { sdp: OFFER_SDP, ...extra });
  expect(status).toBe(201);
  const session = (body as { session: { id: string; accessToken: string } }).session;
  mintedTokens.set(session.id, session.accessToken);
  return session.id;
}

let servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.stop()));
  servers = [];
  mintedTokens.clear();
});

describe('harness HTTP surface', () => {
  it('minting a session initializes harness state (visible via /context)', async () => {
    const s = await startServer();
    servers.push(s);
    const id = await mint(s.baseUrl, { learnerId: 'learner-1' });
    const res = await fetch(`${s.baseUrl}/api/live/session/${id}/context`, { headers: { authorization: `Bearer ${mintedTokens.get(id)}` } });
    expect(res.status).toBe(200);
    const ctx = (await res.json()) as { sessionId: string; objective: { id: string }; rendered: string; turn: number; status: string };
    expect(ctx.sessionId).toBe(id);
    expect(ctx.objective.id).toBe('es-obj-cognates');
    expect(ctx.rendered).toContain('Objective:');
  });

  it('GET /context on an unknown session is 404', async () => {
    const s = await startServer();
    servers.push(s);
    const res = await fetch(`${s.baseUrl}/api/live/session/nope/context`);
    expect(res.status).toBe(401);
  });

  it('POST /tools dispatches commit_teaching_decision end to end', async () => {
    const s = await startServer();
    servers.push(s);
    const id = await mint(s.baseUrl);
    const r = await postJson(s.baseUrl, `/api/live/session/${id}/tools`, {
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-copula' } },
    });
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
    expect((r.body as { result: { turn: number } }).result.turn).toBe(1);
    // context reflects the committed move
    const ctxRes = await fetch(`${s.baseUrl}/api/live/session/${id}/context`, { headers: { authorization: `Bearer ${mintedTokens.get(id)}` } });
    const ctx = (await ctxRes.json()) as { turn: number; concepts: { id: string; status: string }[] };
    expect(ctx.turn).toBe(1);
    expect(ctx.concepts.find((c) => c.id === 'es-copula')?.status).toBe('in_progress');
  });

  it('POST /tools maps invalid_move to 409 and unknown tool to 400', async () => {
    const s = await startServer();
    servers.push(s);
    const id = await mint(s.baseUrl);
    const invalid = await postJson(s.baseUrl, `/api/live/session/${id}/tools`, {
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-ant-ent-endings' } },
    });
    expect(invalid.status).toBe(409);
    expect((invalid.body as { error: { code: string } }).error.code).toBe('invalid_move');
    const unknown = await postJson(s.baseUrl, `/api/live/session/${id}/tools`, {
      tool: 'nope',
      input: {},
    });
    expect(unknown.status).toBe(400);
    expect((unknown.body as { error: { code: string } }).error.code).toBe('unknown_tool');
  });

  it('POST /tools on an unknown session is 404', async () => {
    const s = await startServer();
    servers.push(s);
    const r = await postJson(s.baseUrl, '/api/live/session/nope/tools', {
      tool: 'get_learning_context',
      input: {},
    });
    expect(r.status).toBe(404);
  });

  it('mint accepts an explicit starting objective', async () => {
    const s = await startServer();
    servers.push(s);
    const id = await mint(s.baseUrl, { objectiveId: 'es-obj-quiero' });
    const res = await fetch(`${s.baseUrl}/api/live/session/${id}/context`, { headers: { authorization: `Bearer ${mintedTokens.get(id)}` } });
    const ctx = (await res.json()) as { sessionId: string; objective: { id: string }; rendered: string; turn: number; status: string };
    expect(ctx.objective.id).toBe('es-obj-quiero');
  });

  it('closing a session abandons its harness state', async () => {
    const s = await startServer();
    servers.push(s);
    const id = await mint(s.baseUrl);
    const close = await postJson(s.baseUrl, `/api/live/session/${id}/close`, {});
    expect(close.status).toBe(200);
    const res = await fetch(`${s.baseUrl}/api/live/session/${id}/context`, { headers: { authorization: `Bearer ${mintedTokens.get(id)}` } });
    const ctx = (await res.json()) as { sessionId: string; objective: { id: string }; rendered: string; turn: number; status: string };
    expect(ctx.status).toBe('abandoned');
  });
});
