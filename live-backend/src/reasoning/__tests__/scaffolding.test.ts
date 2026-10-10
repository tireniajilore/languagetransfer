/**
 * Scaffolding selection tests: deterministic next-hint choice among authored
 * hints, and unfamiliar transfer-example selection.
 */
import { describe, expect, it } from 'vitest';
import { selectNextHint, selectTransferExample } from '../scaffolding';
import { CUR, makeHarness, startCopula } from './helpers';

describe('selectNextHint', () => {
  it('returns the first hint for a fresh concept', () => {
    const fx = makeHarness();
    startCopula(fx);
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    const hint = selectNextHint(CUR, state, 'es-copula');
    expect(hint?.level).toBe(1);
    expect(hint?.conceptId).toBe('es-copula');
  });

  it('escalates to the next unused level', () => {
    const fx = makeHarness();
    startCopula(fx);
    fx.router.dispatch({
      sessionId: fx.sessionId,
      tool: 'commit_teaching_decision',
      input: { turnId: 2, move: { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-1' } },
    });
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    expect(state.concepts['es-copula'].hintsUsed).toContain('h-copula-1');
    const hint = selectNextHint(CUR, state, 'es-copula');
    expect(hint?.level).toBe(2);
  });

  it('returns undefined when hints are exhausted', () => {
    const fx = makeHarness();
    startCopula(fx);
    fx.router.dispatch({
      sessionId: fx.sessionId,
      tool: 'commit_teaching_decision',
      input: { turnId: 2, move: { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-1' } },
    });
    fx.router.dispatch({
      sessionId: fx.sessionId,
      tool: 'commit_teaching_decision',
      input: { turnId: 3, move: { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-2' } },
    });
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    expect(selectNextHint(CUR, state, 'es-copula')).toBeUndefined();
  });
});

describe('selectTransferExample', () => {
  it('picks an unfamiliar curriculum transfer example', () => {
    const fx = makeHarness();
    startCopula(fx);
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    const example = selectTransferExample(CUR, state, 'es-copula');
    expect(example).toBeDefined();
    // Must come from the curriculum's transferExamples, never verifiedExamples.
    const concept = CUR.concepts.find((c) => c.id === 'es-copula');
    expect(concept?.transferExamples).toContain(example);
    expect(concept?.verifiedExamples).not.toContain(example);
  });

  it('skips examples the learner has already seen', () => {
    const fx = makeHarness();
    startCopula(fx);
    const before = fx.store.get(fx.sessionId);
    if (!before) throw new Error('no state');
    const first = selectTransferExample(CUR, before, 'es-copula');
    if (!first) throw new Error('no example');
    const used = { ...before, usedExamples: [first] };
    const second = selectTransferExample(CUR, used, 'es-copula');
    expect(second).not.toBe(first);
  });

  it('returns undefined for an unknown concept', () => {
    const fx = makeHarness();
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    expect(selectTransferExample(CUR, state, 'nope')).toBeUndefined();
  });
});
