import { describe, expect, it, vi } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import { createHarnessState } from '../stateMachine';
import {
  DispatchRequest,
  getTool,
  HarnessStore,
  listTools,
  RouterLogEntry,
  ToolRouter,
} from '../tools';

const CUR = SPANISH_CURRICULUM_V1;

function setup() {
  const store = new HarnessStore();
  const logs: RouterLogEntry[] = [];
  const router = new ToolRouter(
    { store, curriculum: CUR, now: () => 1_000 },
    (e) => logs.push(e),
  );
  store.insert(createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 }));
  const d = (tool: string, input: unknown, idempotencyKey?: string): DispatchRequest => ({
    sessionId: 's1',
    tool,
    input,
    idempotencyKey,
  });
  return { store, router, logs, d };
}

describe('tool catalogue', () => {
  it('exposes exactly the seven specified tools', () => {
    const names = listTools().map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'assess_understanding',
        'commit_teaching_decision',
        'get_learner_history',
        'get_learning_context',
        'get_current_objective',
        'get_teaching_options',
        'record_learning_evidence',
      ].sort(),
    );
  });

  it('separates read-only from state-changing tools', () => {
    const readOnly = new Set(
      listTools().filter((t) => t.readOnly).map((t) => t.name),
    );
    expect(readOnly).toEqual(
      new Set(['get_learning_context', 'get_current_objective', 'get_teaching_options', 'get_learner_history']),
    );
  });

  it('every tool has input and output schemas', () => {
    for (const t of listTools()) {
      expect(t.inputSchema).toBeDefined();
      expect(t.outputSchema).toBeDefined();
      expect(t.description.length).toBeGreaterThan(10);
    }
  });
});

describe('dispatch validation', () => {
  it('rejects unknown tools', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 's1', tool: 'nope', input: {} });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('unknown_tool');
  });

  it('rejects unknown sessions', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 'nope', tool: 'get_learning_context', input: {} });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('unknown_session');
  });

  it('rejects invalid input without changing state', () => {
    const { store, router } = setup();
    const before = JSON.stringify(store.get('s1'));
    const r = router.dispatch({
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept' } }, // missing conceptId
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_input');
    expect(JSON.stringify(store.get('s1'))).toBe(before);
  });

  it('rejects non-object input safely', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 's1', tool: 'get_learning_context', input: 'junk' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_input');
  });
});

describe('commit_teaching_decision', () => {
  it('commits a valid move and advances the turn', () => {
    const { router, store } = setup();
    const r = router.dispatch({
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-copula' } },
    });
    expect(r.ok).toBe(true);
    expect((r.result as { turn: number }).turn).toBe(1);
    expect(store.get('s1')?.turn).toBe(1);
    expect(store.get('s1')?.concepts['es-copula'].status).toBe('in_progress');
  });

  it('rejects invalid moves with a reason and does not advance', () => {
    const { router, store } = setup();
    const r = router.dispatch({
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-ant-ent-endings' } },
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalid_move');
    expect(r.error?.detail).toMatch(/locked/);
    expect(store.get('s1')?.turn).toBe(0);
  });

  it('rejects stale turns (delegated decisions computed from outdated state)', () => {
    const { router } = setup();
    const first = router.dispatch({
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-copula' } },
    });
    expect(first.ok).toBe(true);
    // a second, different decision for the same turn is stale
    const stale = router.dispatch({
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'probe_understanding', conceptId: 'es-copula' } },
    });
    expect(stale.ok).toBe(false);
    expect(stale.error?.code).toBe('stale_turn');
    // so is a decision from the future
    const future = router.dispatch({
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 99, move: { move: 'probe_understanding', conceptId: 'es-copula' } },
    });
    expect(future.ok).toBe(false);
    expect(future.error?.code).toBe('stale_turn');
  });

  it('is idempotent: repeating the same call returns the cached result without double-advancing', () => {
    const { router, store } = setup();
    const req = {
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-copula' } },
    };
    const r1 = router.dispatch(req);
    const r2 = router.dispatch(req); // same default key: session:tool:turnId
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r2.result).toEqual(r1.result);
    expect(store.get('s1')?.turn).toBe(1);
    expect(store.get('s1')?.moves).toHaveLength(1);
  });

  it('honours explicit idempotency keys across differing payloads', () => {
    const { router, store } = setup();
    const r1 = router.dispatch({
      sessionId: 's1',
      tool: 'record_learning_evidence',
      input: { turnId: 1, conceptId: 'es-copula', kind: 'correct' },
      idempotencyKey: 'k-1',
    });
    const r2 = router.dispatch({
      sessionId: 's1',
      tool: 'record_learning_evidence',
      input: { turnId: 1, conceptId: 'es-copula', kind: 'incorrect' }, // different payload, same key
      idempotencyKey: 'k-1',
    });
    expect(r1.ok).toBe(true);
    expect(r2).toEqual(r1);
    expect(store.get('s1')?.concepts['es-copula'].correctCount).toBe(1);
    expect(store.get('s1')?.concepts['es-copula'].incorrectCount).toBe(0);
  });
});

describe('assess_understanding', () => {
  it('records evidence and returns status plus suggested moves', () => {
    const { router } = setup();
    const r = router.dispatch({
      sessionId: 's1',
      tool: 'assess_understanding',
      input: { turnId: 1, conceptId: 'es-copula', evidence: { kind: 'incorrect' } },
    });
    expect(r.ok).toBe(true);
    const out = r.result as { status: string; incorrectCount: number; suggestedMoves: unknown[] };
    expect(out.incorrectCount).toBe(1);
    expect(out.suggestedMoves.length).toBeGreaterThan(0);
  });

  it('drives a concept to mastered through repeated assessment', () => {
    const { router, store } = setup();
    const assess = (turnId: number, kind: string) =>
      router.dispatch({
        sessionId: 's1',
        tool: 'assess_understanding',
        input: { turnId, conceptId: 'es-copula', evidence: { kind } },
      });
    assess(1, 'correct');
    assess(2, 'correct');
    const r = assess(3, 'transfer_pass');
    expect(r.ok).toBe(true);
    expect((r.result as { status: string }).status).toBe('mastered');
    expect(store.get('s1')?.concepts['es-copula'].status).toBe('mastered');
  });
});

describe('record_learning_evidence', () => {
  it('is idempotent: an identical retry replays the original result', () => {
    const { router, store } = setup();
    const req = {
      sessionId: 's1',
      tool: 'record_learning_evidence',
      input: { turnId: 0, kind: 'utterance', detail: 'user: hola', seq: 1 },
    };
    const r1 = router.dispatch(req);
    expect(r1.ok).toBe(true);
    expect((r1.result as { recorded: boolean }).recorded).toBe(true);
    const r2 = router.dispatch(req);
    expect(r2).toEqual(r1); // replayed, not double-recorded
    expect(store.get('s1')?.evidence).toHaveLength(1);
  });

  it('records distinct observations with different seq values', () => {
    const { router, store } = setup();
    for (const seq of [1, 2]) {
      const r = router.dispatch({
        sessionId: 's1',
        tool: 'record_learning_evidence',
        input: { turnId: 0, kind: 'utterance', detail: 'user: hola', seq },
      });
      expect((r.result as { recorded: boolean }).recorded).toBe(true);
    }
    expect(store.get('s1')?.evidence).toHaveLength(2);
  });
});

describe('read tools', () => {
  it('get_learning_context returns the assembled context', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 's1', tool: 'get_learning_context', input: {} });
    expect(r.ok).toBe(true);
    const ctx = r.result as { objective: { id: string }; rendered: string };
    expect(ctx.objective.id).toBe('es-obj-cognates');
    expect(ctx.rendered).toContain('Objective:');
  });

  it('get_current_objective reports progress', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 's1', tool: 'get_current_objective', input: {} });
    expect(r.ok).toBe(true);
    const out = r.result as { progress: { requiredTotal: number }; conceptStatuses: unknown[] };
    expect(out.progress.requiredTotal).toBe(3);
    expect(out.conceptStatuses.length).toBe(4);
  });

  it('get_teaching_options lists valid moves only', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 's1', tool: 'get_teaching_options', input: {} });
    expect(r.ok).toBe(true);
    const opts = (r.result as { options: { move: { move: string } }[] }).options;
    expect(opts.length).toBeGreaterThan(0);
    // advance_objective must not be offered before any mastery
    expect(opts.some((o) => o.move.move === 'advance_objective')).toBe(false);
  });

  it('read tools never mutate state', () => {
    const { store, router } = setup();
    const before = JSON.stringify(store.get('s1'));
    for (const tool of ['get_learning_context', 'get_current_objective', 'get_teaching_options', 'get_learner_history']) {
      expect(router.dispatch({ sessionId: 's1', tool, input: {} }).ok).toBe(true);
    }
    expect(JSON.stringify(store.get('s1'))).toBe(before);
  });

  it('get_learner_history is honest about PR 2 scope', () => {
    const { router } = setup();
    const r = router.dispatch({ sessionId: 's1', tool: 'get_learner_history', input: {} });
    expect(r.ok).toBe(true);
    expect((r.result as { note: string }).note).toMatch(/PR 4/);
  });
});

describe('router logging', () => {
  it('logs every dispatch as structured JSON-serializable entries', () => {
    const { router, logs } = setup();
    router.dispatch({ sessionId: 's1', tool: 'get_learning_context', input: {} });
    router.dispatch({ sessionId: 's1', tool: 'nope', input: {} });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ sessionId: 's1', tool: 'get_learning_context', ok: true, readOnly: true });
    expect(logs[1]).toMatchObject({ tool: 'nope', ok: false, errorCode: 'unknown_tool' });
    for (const e of logs) {
      expect(() => JSON.stringify(e)).not.toThrow();
      expect(typeof e.durationMs).toBe('number');
    }
  });

  it('marks idempotent replays in the log', () => {
    const { router, logs } = setup();
    const req = {
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-copula' } },
    };
    router.dispatch(req);
    router.dispatch(req);
    expect(logs[1].replayed).toBe(true);
  });

  it('does not cache failed dispatches', () => {
    const { router } = setup();
    const bad = {
      sessionId: 's1',
      tool: 'commit_teaching_decision',
      input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-ant-ent-endings' } },
    };
    expect(router.dispatch(bad).ok).toBe(false);
    expect(router.dispatch(bad).ok).toBe(false);
    expect(router.cacheSize).toBe(0);
  });
});

describe('getTool', () => {
  it('returns undefined for unknown tools', () => {
    expect(getTool('nope')).toBeUndefined();
    expect(getTool('commit_teaching_decision')?.readOnly).toBe(false);
  });

  it('console logging default does not throw', () => {
    const store = new HarnessStore();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const router = new ToolRouter({ store, curriculum: CUR, now: () => 1_000 });
    store.insert(createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 }));
    router.dispatch({ sessionId: 's1', tool: 'get_learning_context', input: {} });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
