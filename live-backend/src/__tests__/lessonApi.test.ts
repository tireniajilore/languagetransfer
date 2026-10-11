import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server';
import { LiveSessionClient } from '../liveClient';
import { SessionRegistry } from '../sessions';
import { FakeWs } from './fakes';

const OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
let closeServer: (() => Promise<void>) | undefined;
afterEach(async () => { await closeServer?.(); closeServer = undefined; });

async function fixture() {
  let n = 0;
  const fakes: FakeWs[] = [];
  const app = createApp({
    config: {
      openaiApiKey: 'sk-test',
      port: 0,
      allowedOrigins: [],
      rateLimit: { windowMs: 60_000, max: 20 },
      liveModel: 'gpt-live-1',
      sessionInstructions: 'Thinking Method',
      maxReconnectAttempts: 2,
      liveApiBaseUrl: 'https://api.openai.com',
      delegationModel: 'gpt-5.6-terra',
      delegationDisabled: true,
      liveTutorEnabled: true,
      learnerTokenSecret: 'long-test-secret-at-least-thirty-two-chars',
      memoryRetentionDays: 180,
      memoryFlushIntervalMs: 5000,
    },
    registry: new SessionRegistry(),
    wsFactory: () => { const ws = new FakeWs(); fakes.push(ws); return ws; },
    liveClient: new LiveSessionClient({
      apiKey: 'sk-test',
      createFn: async (params) => {
        expect(params.session.instructions).toContain('LESSON 2');
        expect(params.session.instructions).toContain('Never ask what the learner');
        return { session: { id: `live_${++n}` }, transport: { sdp: 'v=0\r\nanswer' } };
      },
    }),
  });
  const http = app.listen(0);
  await new Promise<void>((ok) => http.once('listening', ok));
  closeServer = () => new Promise<void>((ok, fail) => http.close((e) => e ? fail(e) : ok()));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return { base, fakes };
}

describe('lesson-specific API', () => {
  it('starts the authored introduction only after explicit start and sideband readiness', async () => {
    const { base, fakes } = await fixture();
    const overview = await fetch(base + '/api/live/course').then((r) => r.json()) as {
      learnerToken: string; lessons: Array<{number: number; status: string}>;
    };
    expect(overview.lessons.find((l) => l.number === 2)?.status).toBe('available');
    expect(overview.lessons.find((l) => l.number === 3)?.status).toBe('locked');
    const mint = await fetch(base + '/api/live/session', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({ sdp: OFFER_SDP, lessonNumber: 2, learnerToken: overview.learnerToken }),
    });
    expect(mint.status).toBe(201);
    const payload = await mint.json() as { session: {id: string; accessToken: string} };
    const path = `/api/live/session/${payload.session.id}`;
    const auth = {authorization: `Bearer ${payload.session.accessToken}`};
    const premature = await fetch(base + path + '/start', {method: 'POST', headers: auth});
    expect(premature.status).toBe(409);
    expect(fakes[0].sent.length).toBe(0);
    fakes[0].emit('open');
    fakes[0].emitJson('message', {type: 'session.started'});
    const start = await fetch(base + path + '/start', {method: 'POST', headers: auth});
    expect(start.status).toBe(200);
    const commands = fakes[0].sent.map((v) => JSON.parse(v) as {type: string; instructions?: string});
    expect(commands.some((c) => c.type === 'session.instructions.append' && c.instructions?.includes('How would you say metal?'))).toBe(true);
    expect(commands.some((c) => c.type === 'response.create')).toBe(true);
    const dupe = await fetch(base + path + '/start', { method: 'POST', headers: auth });
    expect(dupe.status).toBe(200);
    expect(fakes[0].sent.filter((x) => x.includes('response.create'))).toHaveLength(1);
    const progress = await fetch(base + path + '/progress', {headers: auth});
    expect(progress.status).toBe(200);
    expect((await progress.json() as {phase:string}).phase).toBe('awaiting_answer');
  });

  it('rejects out-of-range and malformed numbers instead of falling back to free tutoring', async () => {
    const {base, fakes} = await fixture();
    for (const lessonNumber of [0, 91, '3']) {
      const r = await fetch(base + '/api/live/session', {
        method: 'POST', headers: {'content-type':'application/json'},
        body: JSON.stringify({sdp: OFFER_SDP, lessonNumber}),
      });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({error: 'invalid_lesson_number'});
    }
    expect(fakes).toHaveLength(0);
  });

  it('refuses to mint Lesson 3 for a new learner even if they enter the route directly', async () => {
    const {base, fakes} = await fixture();
    const token = (await fetch(base + '/api/live/course').then((r) => r.json()) as {learnerToken:string}).learnerToken;
    const res = await fetch(base + '/api/live/session', {
      method:'POST', headers: {'content-type':'application/json'},
      body:JSON.stringify({sdp:OFFER_SDP, lessonNumber:3, learnerToken:token}),
    });
    expect(res.status).toBe(423);
    expect(fakes).toHaveLength(0);
  });
});
