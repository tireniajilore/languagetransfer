import { describe, expect, it } from 'vitest';
import { SessionRegistry } from '../sessions';
import { SidebandConnection } from '../sideband';
import { FakeWs, ManualClock, makeHandlers } from './fakes';

function fakeSideband(): { sideband: SidebandConnection; clock: ManualClock } {
  const clock = new ManualClock();
  const sideband = new SidebandConnection({
    sessionId: 'live_x',
    apiKey: 'sk',
    baseUrl: 'https://api.openai.com',
    handlers: makeHandlers(),
    wsFactory: () => new FakeWs(),
    clock,
  });
  return { sideband, clock };
}

/** Drive the manual clock so close() timers complete without real waiting. */
async function closeAndSettle(
  registry: SessionRegistry,
  clock: ManualClock,
  id: string,
): Promise<boolean> {
  const p = registry.closeSession(id);
  clock.runAll();
  return p;
}

describe('SessionRegistry', () => {
  it('registers, looks up, and closes sessions', async () => {
    const registry = new SessionRegistry();
    const { sideband, clock } = fakeSideband();
    registry.register('live_x', { sideband, createdAt: Date.now() });
    expect(registry.has('live_x')).toBe(true);
    expect(registry.size).toBe(1);

    const closed = await closeAndSettle(registry, clock, 'live_x');
    expect(closed).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('closeSession is idempotent (no double close on retries)', async () => {
    const registry = new SessionRegistry();
    const { sideband, clock } = fakeSideband();
    registry.register('live_x', { sideband, createdAt: Date.now() });
    expect(await closeAndSettle(registry, clock, 'live_x')).toBe(true);
    expect(await registry.closeSession('live_x')).toBe(false); // second: no-op
  });

  it('closing an unknown session is a no-op', async () => {
    const registry = new SessionRegistry();
    expect(await registry.closeSession('live_nope')).toBe(false);
  });

  it('destroyAll tears down every session exactly once', () => {
    const registry = new SessionRegistry();
    const a = fakeSideband().sideband;
    const b = fakeSideband().sideband;
    registry.register('a', { sideband: a, createdAt: Date.now() });
    registry.register('b', { sideband: b, createdAt: Date.now() });
    registry.destroyAll();
    registry.destroyAll(); // second call safe
    expect(registry.size).toBe(0);
    expect(a.getState()).toBe('closed');
    expect(b.getState()).toBe('closed');
  });
});
