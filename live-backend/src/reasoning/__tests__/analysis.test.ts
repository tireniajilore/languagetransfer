/**
 * Response-analysis pipeline tests: deterministic fast path vs reasoning
 * path routing, misconception pattern matching, and delegation escalation.
 */
import { describe, expect, it } from 'vitest';
import { analyzeResponse, needsDelegation } from '../analysis';
import { CUR, makeHarness, startCopula } from './helpers';

describe('analyzeResponse', () => {
  it('routes a correct answer down the fast path', () => {
    const fx = makeHarness();
    startCopula(fx);
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    const result = analyzeResponse({
      curriculum: CUR,
      state,
      utterance: 'es',
      conceptId: 'es-copula',
      expectedAnswers: ['es'],
    });
    expect(result.path).toBe('fast');
    expect(result.match.outcome).toBe('right');
    expect(result.evidenceKind).toBe('correct');
    expect(result.suggestedMoves.length).toBeGreaterThan(0);
    expect(result.delegationRequest).toBeUndefined();
    expect(needsDelegation(result)).toBe(false);
  });

  it('routes unclear speech to fast-path silence', () => {
    const fx = makeHarness();
    startCopula(fx);
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    const result = analyzeResponse({
      curriculum: CUR,
      state,
      utterance: 'what time is lunch',
      conceptId: 'es-copula',
      expectedAnswers: ['es'],
    });
    expect(result.path).toBe('fast');
    expect(result.match.outcome).toBe('unclear');
    expect(result.evidenceKind).toBe('utterance');
    expect(result.suggestedMoves).toEqual([]);
  });

  it('matches a registered misconception pattern on the fast path', () => {
    const fx = makeHarness('s-misc');
    const state = fx.store.get('s-misc');
    if (!state) throw new Error('no state');
    const result = analyzeResponse({
      curriculum: CUR,
      state,
      utterance: 'quiero a cancelar',
      conceptId: 'es-quiero-infinitive',
      expectedAnswers: ['quiero cancelar'],
    });
    expect(result.match.outcome).toBe('wrong');
    expect(result.path).toBe('fast');
    expect(result.misconceptionId).toBe('m-quiero-to');
    expect(result.evidenceKind).toBe('incorrect');
  });

  it('escalates unfamiliar wrong answers to the reasoning path', () => {
    const fx = makeHarness();
    startCopula(fx);
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    const result = analyzeResponse({
      curriculum: CUR,
      state,
      utterance: 'eso',
      conceptId: 'es-copula',
      expectedAnswers: ['es'],
    });
    expect(result.match.outcome).toBe('wrong');
    expect(result.path).toBe('reasoning');
    expect(result.evidenceKind).toBe('incorrect');
    expect(result.delegationRequest).toBeDefined();
    expect(result.delegationRequest?.question).toContain('no registered misconception');
    expect(needsDelegation(result)).toBe(true);
  });

  it('is pure: never mutates the input state', () => {
    const fx = makeHarness();
    startCopula(fx);
    const before = fx.store.get(fx.sessionId);
    if (!before) throw new Error('no state');
    const evidenceBefore = before.evidence.length;
    analyzeResponse({
      curriculum: CUR,
      state: before,
      utterance: 'es',
      conceptId: 'es-copula',
      expectedAnswers: ['es'],
    });
    expect(fx.store.get(fx.sessionId)?.evidence.length).toBe(evidenceBefore);
  });
});
