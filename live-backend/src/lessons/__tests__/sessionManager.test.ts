import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseStore } from '../courseStore';
import {
  LessonSessionManager,
  lessonInstructions,
  type LessonRuntime,
} from '../sessionManager';
import { deterministicDecision, type TeachingSupervisor } from '../supervisor';
import type { TeachingDecision } from '../supervisedConductor';

const supervisor: TeachingSupervisor = {
  delivery: async () => ({
    covered: true,
    drift: false,
    evidence: [],
    confidence: 1,
  }),
  assess: async (spec, s, text) =>
    deterministicDecision(spec, s, text) ??
    ({
      lessonVersion: spec.version,
      stepId: spec.steps[s.stepIndex].id,
      stateVersion: s.stateVersion,
      learnerIntent: 'answer',
      understanding: 'demonstrated',
      proposedAction: 'advance',
      evidence: [text],
      proposedHintLevel: null,
      reasoningSummary: 'test understanding',
      confidence: 1,
    } satisfies TeachingDecision),
};
const runtimes: LessonRuntime[] = [];
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.close();
  vi.useRealTimers();
});
async function fixture(store = new CourseStore(), model = supervisor) {
  const sent: Record<string, unknown>[] = [];
  const manager = new LessonSessionManager(store, model);
  const runtime = await manager.prepare(`s-${Math.random()}`, 'learner', 2, {
    send: (c) => sent.push(c),
    fail: (e) => {
      throw e;
    },
  });
  runtimes.push(runtime);
  runtime.setControlReady(true);
  await runtime.start();
  return { runtime, manager, store, sent };
}
let seq = 0;
async function delivered(runtime: LessonRuntime, text?: string) {
  const step = runtime.spec.steps[runtime.cursor.stepIndex],
    id = `output-${++seq}`;
  runtime.onFragment('assistant', {
    event_id: id,
    delta: text ?? step.text,
    start_ms: seq * 1000,
    end_ms: seq * 1000 + 900,
  });
  await Promise.resolve();
  await Promise.resolve();
  await runtime.activity({
    speaker: 'assistant',
    speaking: false,
    playing: true,
    outputEventId: id,
    seq: ++seq,
  });
}
async function answer(runtime: LessonRuntime, text: string) {
  runtime.onFragment('user', {
    event_id: `user-${++seq}`,
    delta: text,
    start_ms: seq * 1000,
    end_ms: seq * 1000 + 500,
  });
  await vi.advanceTimersByTimeAsync(1600);
}
describe('supervised lesson runtime', () => {
  it('starts with actual material, no assessment targets in voice context or response.create', async () => {
    const { sent, runtime } = await fixture();
    expect(lessonInstructions(2, 'Thinking Method')).toContain(
      'Wait for the application START cue',
    );
    expect(
      sent.find((c) => c.type === 'session.commentary.append')?.content,
    ).toContain('English and Spanish');
    expect(
      sent.every(
        (c) => typeof c.event_id === 'string' && c.delegation_id === null,
      ),
    ).toBe(true);
    expect(sent.some((c) => c.type === 'response.create')).toBe(false);
    expect(runtime.cursor.stepIndex).toBe(0);
    await runtime.start();
    expect(sent).toHaveLength(2);
  });
  it('authorization and acknowledgment never count as delivered; playback alone is insufficient', async () => {
    const { runtime } = await fixture();
    runtime.onEvent({
      type: 'session.commentary.appended',
      client_event_id: runtime.cursor.directive!.id,
    });
    await runtime.activity({
      speaker: 'assistant',
      speaking: false,
      playing: true,
      outputEventId: 'invented',
      seq: ++seq,
    });
    expect(runtime.cursor.stepIndex).toBe(0);
    await delivered(runtime);
    expect(runtime.cursor.stepIndex).toBe(1);
    expect(runtime.cursor.receipts[0].deliveryText).toContain(
      'Latin vocabulary',
    );
  });
  it('finishes every source step with observed delivery and understanding, then unlocks 3', async () => {
    vi.useFakeTimers();
    const { runtime, store } = await fixture();
    let count = 0;
    while (runtime.cursor.phase !== 'completed' && count++ < 100) {
      const step = runtime.spec.steps[runtime.cursor.stepIndex];
      await delivered(runtime);
      if (step.kind === 'question') {
        expect(runtime.cursor.phase).toBe('awaiting_answer');
        await answer(
          runtime,
          step.expectedAnswers[0] ??
            'The emphasis changes to the last syllable',
        );
      }
    }
    expect(count).toBe(runtime.spec.steps.length);
    expect(runtime.cursor.receipts).toHaveLength(count);
    expect(
      (await store.overview('learner')).find((l) => l.number === 3)?.status,
    ).toBe('available');
  });
  it('holds the question on okay and does not assess user speech until the turn settles', async () => {
    vi.useFakeTimers();
    const { runtime } = await fixture();
    await delivered(runtime);
    await delivered(runtime);
    await delivered(runtime);
    const at = runtime.cursor.stepIndex;
    await answer(runtime, 'okay');
    expect(runtime.cursor.stepIndex).toBe(at);
    await runtime.activity({ speaker: 'user', speaking: true, seq: ++seq });
    runtime.onFragment('user', {
      event_id: 'thinking',
      delta: 'The stress ',
      start_ms: 10000,
      end_ms: 11000,
    });
    await vi.advanceTimersByTimeAsync(2200);
    expect(runtime.cursor.stepIndex).toBe(at);
    runtime.onFragment('user', {
      event_id: 'answer-rest',
      delta: 'changes to the end',
      start_ms: 11200,
      end_ms: 12000,
    });
    await runtime.activity({ speaker: 'user', speaking: false, seq: ++seq });
    await vi.advanceTimersByTimeAsync(1600);
    expect(runtime.cursor.stepIndex).toBe(at + 1);
  });
  it('never advances for drift and retries the same step', async () => {
    const bad: TeachingSupervisor = {
      ...supervisor,
      delivery: async () => ({
        covered: false,
        drift: true,
        evidence: [],
        confidence: 1,
      }),
    };
    const { runtime, sent } = await fixture(new CourseStore(), bad);
    await delivered(runtime, 'Let us learn future tense.');
    expect(runtime.cursor.stepIndex).toBe(0);
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(2);
  });
  it('resumes from last verified step, replaying interrupted output', async () => {
    const { runtime, manager, store } = await fixture();
    await delivered(runtime);
    await manager.forgetSession(runtime['sessionId']);
    const next = await fixture(store);
    expect(next.runtime.cursor.stepIndex).toBe(1);
    expect(
      next.sent.find((c) => c.type === 'session.commentary.append')?.content,
    ).toContain('NOR-mal');
  });
  it('terminates when control is lost and rejects concurrent learner sessions', async () => {
    const failures: unknown[] = [];
    const store = new CourseStore(),
      manager = new LessonSessionManager(store, supervisor);
    const first = await manager.prepare('owner', 'learner', 2, {
      send: () => {},
      fail: (e) => failures.push(e),
    });
    runtimes.push(first);
    first.setControlReady(true);
    await first.start();
    await expect(
      manager.prepare('other', 'learner', 2, {
        send: () => {},
        fail: () => {},
      }),
    ).rejects.toThrow('already active');
    first.setControlReady(false);
    expect(failures).toHaveLength(1);
    expect(first.cursor.stepIndex).toBe(0);
  });
});

describe('teaching concurrency and continuity', () => {
  it('does not commit an assessment when further learner speech arrives while it is pending', async () => {
    vi.useFakeTimers();
    let resolve: (d: TeachingDecision) => void = () => {};
    let pending: TeachingDecision | undefined;
    const deferred: TeachingSupervisor = {
      ...supervisor,
      assess: async (spec, state, text) => {
        const d = await supervisor.assess(spec, state, text);
        if (text === 'The emphasis changes') {
          pending = d;
          return new Promise<TeachingDecision>((r) => {
            resolve = r;
          });
        }
        return { ...d, understanding: 'incorrect', proposedAction: 'probe' };
      },
    };
    const { runtime } = await fixture(new CourseStore(), deferred);
    await delivered(runtime);
    await delivered(runtime);
    await delivered(runtime);
    const at = runtime.cursor.stepIndex;
    runtime.onFragment('user', {
      event_id: 'partial-thinking',
      delta: 'The emphasis changes',
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(pending).toBeDefined();
    runtime.onFragment('user', {
      event_id: 'faulty-reason',
      delta: 'because Spanish always stresses the first syllable',
    });
    resolve(pending!);
    await vi.advanceTimersByTimeAsync(1600);
    expect(runtime.cursor.stepIndex).toBe(at);
  });
  it('bounds silent-teacher retries and never uses silence to advance a learner question', async () => {
    vi.useFakeTimers();
    const { runtime, sent } = await fixture();
    for (let i = 0; i < 3; i++) {
      await runtime.activity({
        speaker: 'assistant',
        speaking: false,
        playing: false,
        seq: ++seq,
      });
      await vi.advanceTimersByTimeAsync(13000);
    }
    expect(runtime.cursor.phase).toBe('paused');
    expect(runtime.cursor.stepIndex).toBe(0);
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(3);
  });
  it('waits for a long played explanation before advancing through to the question', async () => {
    vi.useFakeTimers();
    const { runtime, sent } = await fixture();
    const id = 'long-explanation';
    runtime.onFragment('assistant', {
      event_id: id,
      delta: runtime.spec.steps[0].text,
    });
    for (let i = 0; i < 20; i++) {
      await runtime.activity({
        speaker: 'assistant',
        speaking: true,
        playing: true,
        seq: ++seq,
      });
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(1);
    expect(runtime.cursor.stepIndex).toBe(0);
    await runtime.activity({
      speaker: 'assistant',
      speaking: false,
      playing: true,
      outputEventId: id,
      seq: ++seq,
    });
    expect(runtime.cursor.stepIndex).toBe(1);
    await delivered(runtime);
    await delivered(runtime);
    expect(runtime.cursor.phase).toBe('awaiting_answer');
    expect(runtime.cursor.stepIndex).toBe(2);
  });
  it('never resends speech while a delivery assessment is still pending', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const model: TeachingSupervisor = {
      ...supervisor,
      delivery: () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              covered: true,
              drift: false,
              evidence: [],
              confidence: 1,
            });
        }),
    };
    const { runtime, sent } = await fixture(new CourseStore(), model);
    const boundary = delivered(runtime);
    await vi.advanceTimersByTimeAsync(20000);
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(1);
    finish();
    await boundary;
    expect(runtime.cursor.stepIndex).toBe(1);
  });
  it('retries failed verification on the same recorded passage without replaying audio', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const model: TeachingSupervisor = {
      ...supervisor,
      delivery: async () => {
        if (++calls < 3) throw new Error('temporary supervisor outage');
        return { covered: true, drift: false, evidence: [], confidence: 1 };
      },
    };
    const { runtime, sent } = await fixture(new CourseStore(), model);
    await delivered(runtime);
    await vi.advanceTimersByTimeAsync(4500);
    expect(calls).toBe(3);
    expect(runtime.cursor.stepIndex).toBe(1);
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(2);
  });
  it('pauses after bounded verification failures rather than repeating the intro', async () => {
    vi.useFakeTimers();
    const model: TeachingSupervisor = {
      ...supervisor,
      delivery: async () => {
        throw new Error('unavailable');
      },
    };
    const { runtime, sent } = await fixture(new CourseStore(), model);
    await delivered(runtime);
    await vi.advanceTimersByTimeAsync(4500);
    expect(runtime.cursor.phase).toBe('paused');
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(1);
  });
  it('does not restart an explanation for a learner acknowledgment', async () => {
    vi.useFakeTimers();
    const { runtime, sent } = await fixture();
    await answer(runtime, 'okay');
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(1);
    expect(runtime.cursor.stepIndex).toBe(0);
  });
  it('resumes delivery verification when the microphone becomes quiet after the audio receipt expires', async () => {
    vi.useFakeTimers();
    const { runtime } = await fixture();
    await runtime.activity({ speaker: 'user', speaking: true, seq: ++seq });
    await delivered(runtime);
    await vi.advanceTimersByTimeAsync(4000);
    expect(runtime.cursor.stepIndex).toBe(0);
    await runtime.activity({ speaker: 'user', speaking: false, seq: ++seq });
    expect(runtime.cursor.stepIndex).toBe(1);
  });
  it('honors pause during pending delivery verification and rejects its late completion', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const model: TeachingSupervisor = {
      ...supervisor,
      delivery: () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              covered: true,
              drift: false,
              evidence: [],
              confidence: 1,
            });
        }),
    };
    const { runtime, sent } = await fixture(new CourseStore(), model);
    const boundary = delivered(runtime);
    await vi.advanceTimersByTimeAsync(10);
    await answer(runtime, 'pause please');
    expect(runtime.cursor.phase).toBe('paused');
    finish();
    await boundary;
    expect(runtime.cursor.stepIndex).toBe(0);
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(1);
  });
  it('cannot replay a stale clarification over a newer pause request', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const model: TeachingSupervisor = {
      ...supervisor,
      assess: async (spec, state, text) => {
        const d = await supervisor.assess(spec, state, text);
        return new Promise((resolve) => {
          finish = () =>
            resolve({
              ...d,
              learnerIntent: 'clarification',
              proposedAction: 'repeat',
              understanding: 'not_assessed',
            });
        });
      },
    };
    const { runtime, sent } = await fixture(new CourseStore(), model);
    await answer(runtime, 'What does that mean?');
    await answer(runtime, 'pause please');
    finish();
    await vi.advanceTimersByTimeAsync(10);
    expect(runtime.cursor.phase).toBe('paused');
    expect(
      sent.filter((c) => c.type === 'session.commentary.append'),
    ).toHaveLength(1);
  });
  it('cancels a pending verification retry when the session closes', async () => {
    vi.useFakeTimers();
    const delivery = vi.fn(async () => {
      throw new Error('temporary outage');
    });
    const { runtime } = await fixture(new CourseStore(), {
      ...supervisor,
      delivery,
    });
    await delivered(runtime);
    await runtime.close();
    await vi.advanceTimersByTimeAsync(4000);
    expect(delivery).toHaveBeenCalledTimes(1);
  });
  it('keeps an early question answer until delivery verification finishes', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const model: TeachingSupervisor = {
      ...supervisor,
      delivery: async (spec, state) => {
        if (state.stepIndex !== 2)
          return { covered: true, drift: false, evidence: [], confidence: 1 };
        return new Promise((resolve) => {
          finish = () =>
            resolve({
              covered: true,
              drift: false,
              evidence: [],
              confidence: 1,
            });
        });
      },
    };
    const { runtime } = await fixture(new CourseStore(), model);
    await delivered(runtime);
    await delivered(runtime);
    const boundary = delivered(runtime);
    await vi.advanceTimersByTimeAsync(10);
    await answer(runtime, 'The emphasis changes to the last syllable');
    finish();
    await boundary;
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.cursor.stepIndex).toBe(3);
  });
  it('retains an explicit pause across reconnect and waits for resume', async () => {
    vi.useFakeTimers();
    const { runtime, manager, store } = await fixture();
    runtime.onFragment('user', {
      event_id: 'pause-request',
      delta: 'pause please',
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(runtime.cursor.phase).toBe('paused');
    await manager.forgetSession(runtime['sessionId']);
    const next = await fixture(store);
    expect(next.runtime.cursor.phase).toBe('paused');
    expect(next.sent).toHaveLength(0);
    next.runtime.onFragment('user', {
      event_id: 'resume-request',
      delta: 'resume',
    });
    await vi.advanceTimersByTimeAsync(1600);
    expect(next.runtime.cursor.phase).toBe('sent');
    expect(next.sent).toHaveLength(2);
  });
  it('matches the browser playback boundary when fragment start times tie', async () => {
    const { runtime } = await fixture();
    const text = runtime.spec.steps[0].text;
    const cut = Math.floor(text.length / 2);
    runtime.onFragment('assistant', {
      event_id: 'end',
      delta: text.slice(cut),
      start_ms: 0,
      end_ms: 200,
    });
    runtime.onFragment('assistant', {
      event_id: 'start',
      delta: text.slice(0, cut),
      start_ms: 0,
      end_ms: 100,
    });
    await runtime.activity({
      speaker: 'assistant',
      speaking: false,
      playing: true,
      outputEventId: 'end',
      seq: ++seq,
    });
    expect(runtime.cursor.stepIndex).toBe(1);
    expect(runtime.cursor.receipts[0].deliveryText).toBe(text);
    expect(runtime.cursor.receipts[0].deliveryEventId).toBe('end');
  });
  it('orders fragments on the session timeline and ignores duplicate events', async () => {
    const { runtime } = await fixture();
    const text = runtime.spec.steps[0].text;
    const cut = Math.floor(text.length / 2);
    runtime.onFragment('assistant', {
      event_id: 'last',
      delta: text.slice(cut),
      start_ms: 200,
      end_ms: 300,
    });
    runtime.onFragment('assistant', {
      event_id: 'first',
      delta: text.slice(0, cut),
      start_ms: 100,
      end_ms: 200,
    });
    runtime.onFragment('assistant', {
      event_id: 'first',
      delta: text.slice(0, cut),
      start_ms: 100,
      end_ms: 200,
    });
    await runtime.activity({
      speaker: 'assistant',
      speaking: false,
      playing: true,
      outputEventId: 'last',
      seq: ++seq,
    });
    expect(runtime.cursor.stepIndex).toBe(1);
    expect(runtime.cursor.receipts[0].deliveryText).toBe(text);
  });
});
