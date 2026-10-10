import { beforeEach, describe, expect, it } from 'vitest';
import { SidebandConnection } from '../sideband';
import { FakeWs, ManualClock, makeHandlers } from './fakes';

function makeConn(opts?: {
  wsInstances?: FakeWs[];
  maxReconnectAttempts?: number;
  baseBackoffMs?: number;
  closeTimeoutMs?: number;
}) {
  const wsInstances = opts?.wsInstances ?? [];
  const clock = new ManualClock();
  const handlers = makeHandlers();
  const conn = new SidebandConnection({
    sessionId: 'live_test123',
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com',
    handlers,
    wsFactory: (url, wsOpts) => {
      const ws = new FakeWs();
      ws.lastUrl = url;
      ws.lastHeaders = wsOpts.headers;
      wsInstances.push(ws);
      return ws;
    },
    maxReconnectAttempts: opts?.maxReconnectAttempts ?? 5,
    baseBackoffMs: opts?.baseBackoffMs ?? 1_000,
    closeTimeoutMs: opts?.closeTimeoutMs ?? 5_000,
    clock,
  });
  return { conn, clock, handlers, wsInstances };
}

describe('SidebandConnection', () => {
  let ctx: ReturnType<typeof makeConn>;
  beforeEach(() => {
    ctx = makeConn();
  });

  it('attaches to the documented URL with the API key in the Authorization header', () => {
    ctx.conn.attach();
    expect(ctx.wsInstances).toHaveLength(1);
    expect(ctx.wsInstances[0].lastUrl).toBe(
      'https://api.openai.com/v1/live/sessions/live_test123/attach',
    );
    expect(ctx.wsInstances[0].lastHeaders.Authorization).toBe('Bearer sk-test');
  });

  it('routes session.started to onReady and transcript deltas by speaker', () => {
    ctx.conn.attach();
    const ws = ctx.wsInstances[0];
    ws.emit('open');
    ws.emitJson('message', { type: 'session.started', event_id: 'e1', session: {} });
    expect(ctx.handlers.ready).toEqual(['live_test123']);

    ws.emitJson('message', { type: 'session.input_transcript.delta', delta: 'hola' });
    ws.emitJson('message', { type: 'session.output_transcript.delta', delta: 'bien' });
    expect(ctx.handlers.deltas).toEqual([
      { speaker: 'user', delta: 'hola' },
      { speaker: 'assistant', delta: 'bien' },
    ]);
  });

  it('ignores malformed frames without crashing', () => {
    ctx.conn.attach();
    const ws = ctx.wsInstances[0];
    ws.emit('open');
    ws.emit('message', 'not json' as never);
    ws.emit('message', JSON.stringify({ noType: true }) as never);
    expect(ctx.handlers.errors).toHaveLength(0);
    expect(ctx.conn.getState()).toBe('open');
  });

  it('handles session.closed by cleaning up exactly once', () => {
    ctx.conn.attach();
    const ws = ctx.wsInstances[0];
    ws.emit('open');
    ws.emitJson('message', { type: 'session.closed', event_id: 'e9', reason: 'expired' });
    expect(ctx.handlers.closed).toEqual([{ id: 'live_test123', reason: 'expired' }]);
    expect(ctx.conn.getState()).toBe('closed');
    expect(ws.closeCalls).toBe(1);

    // A second session.closed must not double-report.
    ws.emitJson('message', { type: 'session.closed', event_id: 'e10' });
    expect(ctx.handlers.closed).toHaveLength(1);
  });

  it('close() sends session.close and resolves on session.closed (idempotent)', async () => {
    ctx.conn.attach();
    const ws = ctx.wsInstances[0];
    ws.emit('open');
    const p = ctx.conn.close();
    expect(ws.sent).toEqual([JSON.stringify({ type: 'session.close' })]);
    ws.emitJson('message', { type: 'session.closed', event_id: 'e2', reason: 'close_requested' });
    await p;
    expect(ctx.handlers.closed).toEqual([{ id: 'live_test123', reason: 'close_requested' }]);

    await ctx.conn.close(); // second call: no-op
    expect(ws.sent).toHaveLength(1);
    expect(ctx.handlers.closed).toHaveLength(1);
  });

  it('close() resolves on timeout when session.closed never arrives', async () => {
    ctx.conn.attach();
    const p = ctx.conn.close();
    ctx.clock.runAll(); // fires the close-timeout timer
    await p;
    expect(ctx.handlers.closed).toEqual([{ id: 'live_test123', reason: 'close_timeout' }]);
    expect(ctx.conn.getState()).toBe('closed');
  });

  it('reconnects with backoff on an unexpected drop', () => {
    ctx.conn.attach();
    const ws = ctx.wsInstances[0];
    ws.emit('open');
    ws.emit('close');
    expect(ctx.conn.getState()).toBe('reconnecting');
    expect(ctx.clock.pendingCount()).toBe(1);

    ctx.clock.runAll(); // backoff fires -> re-attach
    expect(ctx.wsInstances).toHaveLength(2);
    expect(ctx.conn.reconnectCount).toBe(1);
    expect(ctx.conn.getState()).toBe('connecting');
  });

  it('gives up after maxReconnectAttempts and reports failure', () => {
    const local = makeConn({ maxReconnectAttempts: 2, baseBackoffMs: 10 });
    local.conn.attach();
    for (let i = 0; i < 3; i++) {
      local.clock.runAll();
      local.wsInstances[local.wsInstances.length - 1].emit('close');
    }
    expect(local.conn.getState()).toBe('failed');
    expect(local.handlers.errors.length).toBeGreaterThan(0);
    expect(local.handlers.closed).toEqual([{ id: 'live_test123', reason: 'reconnect_exhausted' }]);
    // no further reconnect timers
    expect(local.clock.pendingCount()).toBe(0);
  });

  it('does not reconnect after an explicit close()', async () => {
    ctx.conn.attach();
    const ws = ctx.wsInstances[0];
    ws.emit('open');
    const p = ctx.conn.close();
    ws.emitJson('message', { type: 'session.closed', event_id: 'e3' });
    await p;
    expect(ctx.clock.pendingCount()).toBe(0);
    expect(ctx.wsInstances).toHaveLength(1);
  });

  it('destroy() is idempotent and reports a single close', () => {
    ctx.conn.attach();
    ctx.conn.destroy();
    ctx.conn.destroy();
    expect(ctx.handlers.closed).toHaveLength(1);
    expect(ctx.conn.getState()).toBe('closed');
  });
});
