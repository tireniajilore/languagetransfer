/**
 * Tri-state scoring tests. Cases ported from PR #11's check-answer-match
 * script (the 14-case labelled set) plus backend-specific edges.
 */
import { describe, expect, it } from 'vitest';
import { matchAnswer, normalize } from '../answerMatch';

describe('matchAnswer', () => {
  it('scores exact matches right', () => {
    const r = matchAnswer('quiero cancelar', ['quiero cancelar', 'quiero preparar']);
    expect(r.outcome).toBe('right');
    expect(r.distance).toBe(0);
  });

  it('is generous with dropped pronouns and hesitations', () => {
    expect(matchAnswer('yo quiero cancelar', ['quiero cancelar']).outcome).toBe('right');
    expect(matchAnswer('um, yo quiero cancelar', ['quiero cancelar']).outcome).toBe('right');
    expect(matchAnswer('eh quiero cancelar', ['quiero cancelar']).outcome).toBe('right');
  });

  it('treats added negation as a real wrong attempt, not noise', () => {
    // `no` is deliberately NOT ignorable: it flips meaning.
    const r = matchAnswer('no quiero cancelar', ['quiero cancelar']);
    expect(r.outcome).toBe('wrong');
  });

  it('uses prefix detection for short targets', () => {
    // "esta" vs "es" would score 0.50 on a flat ratio; the prefix detector
    // keeps this as an attempt rather than dropping it to unclear.
    const r = matchAnswer('esta', ['es']);
    expect(r.outcome).toBe('wrong');
  });

  it('scores clear misses as wrong', () => {
    expect(matchAnswer('quiero cancelo', ['quiero cancelar']).outcome).toBe('wrong');
    expect(matchAnswer('quiero canselar', ['quiero cancelar']).outcome).toBe('wrong');
    expect(matchAnswer('genelar', ['generar']).outcome).toBe('wrong');
  });

  it('scores unrelated speech as unclear (silence, never a bogus correction)', () => {
    expect(matchAnswer('what time is lunch', ['quiero cancelar']).outcome).toBe('unclear');
    expect(matchAnswer('blah blah blah', ['es']).outcome).toBe('unclear');
  });

  it('is unclear with no evidence, never guessing', () => {
    expect(matchAnswer('', ['quiero']).outcome).toBe('unclear');
    expect(matchAnswer('quiero', []).outcome).toBe('unclear');
    expect(matchAnswer('   ', ['quiero']).outcome).toBe('unclear');
  });

  it('strips accents before comparing', () => {
    expect(matchAnswer('cancion', ['canción']).outcome).toBe('right');
  });

  it('picks the closest accepted answer as the target', () => {
    const r = matchAnswer('quiero preparar', ['quiero cancelar', 'quiero preparar']);
    expect(r.outcome).toBe('right');
    expect(r.target).toBe('quiero preparar');
  });
});

describe('normalize', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalize('  ¿Quiero Cancelar? ')).toBe('quiero cancelar');
    expect(normalize('TE QUIERO')).toBe('te quiero');
  });
});
