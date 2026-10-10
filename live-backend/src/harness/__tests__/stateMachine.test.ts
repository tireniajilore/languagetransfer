import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import { Curriculum } from '../../curriculum/types';
import {
  abandonSession,
  applyMove,
  createHarnessState,
  pauseSession,
  recordEvidence,
  resumeSession,
  validateMove,
} from '../stateMachine';
import { HarnessState } from '../types';

const CUR: Curriculum = SPANISH_CURRICULUM_V1;

function fresh(now = 1_000): HarnessState {
  return createHarnessState({ sessionId: 's1', curriculum: CUR, now });
}

/** Commit a move, returning the new state. */
function commit(state: HarnessState, move: unknown, now = 1_000): HarnessState {
  return applyMove(CUR, state, move, { now });
}

/** Record evidence until a concept is mastered (2 correct + 1 transfer pass). */
function master(state: HarnessState, conceptId: string, now = 1_000): HarnessState {
  let s = state;
  s = recordEvidence(CUR, s, { turnId: s.turn + 1, conceptId, kind: 'correct' }, now);
  s = recordEvidence(CUR, s, { turnId: s.turn + 2, conceptId, kind: 'correct' }, now);
  s = recordEvidence(CUR, s, { turnId: s.turn + 3, conceptId, kind: 'transfer_pass' }, now);
  return s;
}

describe('createHarnessState', () => {
  it('starts entry concepts as available and gated concepts as locked', () => {
    const s = fresh();
    expect(s.status).toBe('initializing');
    expect(s.concepts['es-copula'].status).toBe('available');
    expect(s.concepts['es-al-endings'].status).toBe('available');
    expect(s.concepts['es-ant-ent-endings'].status).toBe('locked');
    expect(s.concepts['es-mente-adverbs'].status).toBe('locked');
  });

  it('starts at the requested objective', () => {
    const s = createHarnessState({
      sessionId: 's1',
      curriculum: CUR,
      objectiveId: 'es-obj-quiero',
      now: 1_000,
    });
    expect(s.currentObjectiveId).toBe('es-obj-quiero');
  });

  it('rejects invalid curricula', () => {
    const bad = { ...CUR, concepts: [] };
    expect(() => createHarnessState({ sessionId: 's1', curriculum: bad })).toThrow();
  });
});

describe('validateMove — hard pedagogical controls', () => {
  it('allows introducing an available concept, rejects locked ones', () => {
    const s = fresh();
    expect(validateMove(CUR, s, { move: 'introduce_concept', conceptId: 'es-copula' }).ok).toBe(true);
    const locked = validateMove(CUR, s, { move: 'introduce_concept', conceptId: 'es-ant-ent-endings' });
    expect(locked.ok).toBe(false);
    expect(locked.reason).toMatch(/locked/);
  });

  it('rejects moves for unknown concepts and concepts outside the objective', () => {
    const s = fresh();
    expect(validateMove(CUR, s, { move: 'introduce_concept', conceptId: 'nope' }).ok).toBe(false);
    // es-quiero-want belongs to the second objective
    const r = validateMove(CUR, s, { move: 'introduce_concept', conceptId: 'es-quiero-want' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not in the current objective/);
  });

  it('enforces strictly escalating hints', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    // skipping to level 2 is rejected
    const skip = validateMove(CUR, s, { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-2' });
    expect(skip.ok).toBe(false);
    expect(skip.reason).toMatch(/escalate/);
    // unknown hint id is rejected
    expect(
      validateMove(CUR, s, { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-nope' }).ok,
    ).toBe(false);
    // level 1 is accepted and recorded
    s = commit(s, { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-1' });
    expect(s.concepts['es-copula'].hintsUsed).toEqual(['h-copula-1']);
    // repeating level 1 is rejected; level 2 now allowed
    expect(
      validateMove(CUR, s, { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-1' }).ok,
    ).toBe(false);
    expect(
      validateMove(CUR, s, { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-2' }).ok,
    ).toBe(true);
  });

  it('rejects premature answer reveals; allows them after recorded struggle', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    const early = validateMove(CUR, s, {
      move: 'reveal_answer',
      conceptId: 'es-copula',
      justification: 'learner asked',
    });
    expect(early.ok).toBe(false);
    expect(early.reason).toMatch(/no premature reveals/);
    // a hint counts as struggle
    s = commit(s, { move: 'give_hint', conceptId: 'es-copula', hintId: 'h-copula-1' });
    expect(
      validateMove(CUR, s, {
        move: 'reveal_answer',
        conceptId: 'es-copula',
        justification: 'two hints given, productive struggle exhausted',
      }).ok,
    ).toBe(true);
  });

  it('reveal after an incorrect answer is also allowed', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    s = recordEvidence(CUR, s, { turnId: 1, conceptId: 'es-copula', kind: 'incorrect' });
    expect(
      validateMove(CUR, s, {
        move: 'reveal_answer',
        conceptId: 'es-copula',
        justification: 'incorrect attempt recorded',
      }).ok,
    ).toBe(true);
  });

  it('requires transfer examples to be unfamiliar', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    // a taught example is rejected
    expect(
      validateMove(CUR, s, { move: 'test_transfer', conceptId: 'es-copula', example: 'es normal' }).ok,
    ).toBe(false);
    // a fresh example is accepted and then marked used
    s = commit(s, { move: 'test_transfer', conceptId: 'es-copula', example: 'es posible' });
    expect(s.usedExamples).toContain('es posible');
    expect(
      validateMove(CUR, s, { move: 'test_transfer', conceptId: 'es-copula', example: 'es posible' }).ok,
    ).toBe(false);
  });

  it('rejects invented counterexamples', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-al-endings' });
    expect(
      validateMove(CUR, s, {
        move: 'give_counterexample',
        conceptId: 'es-al-endings',
        counterexample: 'something I just made up',
      }).ok,
    ).toBe(false);
    const verified = CUR.concepts.find((c) => c.id === 'es-al-endings')!.counterexamples[0];
    expect(
      validateMove(CUR, s, {
        move: 'give_counterexample',
        conceptId: 'es-al-endings',
        counterexample: verified,
      }).ok,
    ).toBe(true);
  });

  it('rejects revisits of non-prerequisites and non-prerequisite decompositions', () => {
    // es-ant-ent-endings requires es-al-endings; es-copula is not a prerequisite.
    // Unlock the chain first: master es-al-endings, then introduce es-ant-ent-endings.
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-al-endings' });
    s = master(s, 'es-al-endings');
    s = commit(s, { move: 'introduce_concept', conceptId: 'es-ant-ent-endings' });
    expect(
      validateMove(CUR, s, {
        move: 'revisit_prerequisite',
        conceptId: 'es-ant-ent-endings',
        prerequisiteId: 'es-copula',
      }).ok,
    ).toBe(false);
    expect(
      validateMove(CUR, s, {
        move: 'revisit_prerequisite',
        conceptId: 'es-ant-ent-endings',
        prerequisiteId: 'es-al-endings',
      }).ok,
    ).toBe(true);
    expect(
      validateMove(CUR, s, {
        move: 'decompose_problem',
        conceptId: 'es-ant-ent-endings',
        subConcepts: ['es-copula'],
      }).ok,
    ).toBe(false);
    expect(
      validateMove(CUR, s, {
        move: 'decompose_problem',
        conceptId: 'es-ant-ent-endings',
        subConcepts: ['es-al-endings'],
      }).ok,
    ).toBe(true);
  });

  it('rejects unregistered misconception corrections', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-al-endings' });
    expect(
      validateMove(CUR, s, {
        move: 'correct_misconception',
        conceptId: 'es-al-endings',
        misconceptionId: 'm-made-up',
      }).ok,
    ).toBe(false);
    expect(
      validateMove(CUR, s, {
        move: 'correct_misconception',
        conceptId: 'es-al-endings',
        misconceptionId: 'm-al-stress',
      }).ok,
    ).toBe(true);
  });

  it('gates objective advancement on mastered required concepts', () => {
    const s = fresh();
    const blocked = validateMove(CUR, s, { move: 'advance_objective', objectiveId: 'es-obj-cognates' });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/not yet mastered/);
    // wrong objective id
    expect(
      validateMove(CUR, s, { move: 'advance_objective', objectiveId: 'es-obj-quiero' }).ok,
    ).toBe(false);
    // skipping the curriculum order is rejected
    let s2 = master(fresh(), 'es-copula');
    s2 = master(s2, 'es-al-endings');
    s2 = master(s2, 'es-ant-ent-endings');
    expect(
      validateMove(CUR, s2, {
        move: 'advance_objective',
        objectiveId: 'es-obj-cognates',
        toObjectiveId: 'es-obj-cognates',
      }).ok,
    ).toBe(false);
    const ok = validateMove(CUR, s2, { move: 'advance_objective', objectiveId: 'es-obj-cognates' });
    expect(ok.ok).toBe(true);
    const s3 = commit(s2, { move: 'advance_objective', objectiveId: 'es-obj-cognates' });
    expect(s3.currentObjectiveId).toBe('es-obj-quiero');
    expect(s3.status).toBe('teaching');
  });

  it('completes the session when the final objective advances', () => {
    let s = createHarnessState({
      sessionId: 's1',
      curriculum: CUR,
      objectiveId: 'es-obj-quiero',
      now: 1_000,
    });
    s = master(s, 'es-ion-endings');
    s = master(s, 'es-quiero-want');
    s = master(s, 'es-quiero-infinitive');
    s = commit(s, { move: 'advance_objective', objectiveId: 'es-obj-quiero' });
    expect(s.status).toBe('completed');
    // no further moves once completed
    expect(
      validateMove(CUR, s, { move: 'introduce_concept', conceptId: 'es-ion-endings' }).ok,
    ).toBe(false);
  });

  it('unlocks dependents when prerequisites are mastered (no skipping)', () => {
    let s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-al-endings' });
    expect(s.concepts['es-ant-ent-endings'].status).toBe('locked');
    s = master(s, 'es-al-endings');
    expect(s.concepts['es-al-endings'].status).toBe('mastered');
    expect(s.concepts['es-ant-ent-endings'].status).toBe('available');
  });
});

describe('mastery derivation (observations are not mastery)', () => {
  it('a single correct answer does not imply mastery', () => {
    let s = fresh();
    s = recordEvidence(CUR, s, { turnId: 1, conceptId: 'es-copula', kind: 'correct' });
    expect(s.concepts['es-copula'].status).not.toBe('mastered');
  });

  it('mastery needs enough correct evidence plus a transfer pass', () => {
    let s = fresh();
    s = recordEvidence(CUR, s, { turnId: 1, conceptId: 'es-copula', kind: 'correct' });
    s = recordEvidence(CUR, s, { turnId: 2, conceptId: 'es-copula', kind: 'correct' });
    expect(s.concepts['es-copula'].status).not.toBe('mastered');
    s = recordEvidence(CUR, s, { turnId: 3, conceptId: 'es-copula', kind: 'transfer_pass' });
    expect(s.concepts['es-copula'].status).toBe('mastered');
  });

  it('open misconceptions block mastery until resolved by a correct answer', () => {
    // Flag a misconception mid-stream: it blocks mastery until a correct
    // answer resolves it — and evidence must still reach the threshold.
    let s2 = fresh();
    s2 = recordEvidence(CUR, s2, { turnId: 1, conceptId: 'es-copula', kind: 'correct' });
    s2 = recordEvidence(CUR, s2, {
      turnId: 2,
      conceptId: 'es-copula',
      kind: 'misconception_flagged',
      misconceptionId: 'm-al-stress',
    });
    s2 = recordEvidence(CUR, s2, { turnId: 3, conceptId: 'es-copula', kind: 'correct' });
    // the correct answer resolved the flag, but evidence is still short of mastery
    expect(s2.concepts['es-copula'].openMisconceptions).toEqual([]);
    expect(s2.concepts['es-copula'].status).not.toBe('mastered');
  });

  it('repeated incorrect answers mark a concept as struggling', () => {
    let s = fresh();
    for (let i = 1; i <= 3; i++) {
      s = recordEvidence(CUR, s, { turnId: i, conceptId: 'es-copula', kind: 'incorrect' });
    }
    expect(s.concepts['es-copula'].status).toBe('struggling');
  });
});

describe('evidence idempotency and ordering', () => {
  it('ignores duplicate evidence records (same key)', () => {
    let s = fresh();
    s = recordEvidence(CUR, s, { turnId: 1, conceptId: 'es-copula', kind: 'correct' });
    const again = recordEvidence(CUR, s, { turnId: 1, conceptId: 'es-copula', kind: 'correct' });
    expect(again.evidence.length).toBe(s.evidence.length);
    expect(again.concepts['es-copula'].correctCount).toBe(1);
  });

  it('accepts out-of-order turnIds without corrupting counts', () => {
    let s = fresh();
    s = recordEvidence(CUR, s, { turnId: 5, conceptId: 'es-copula', kind: 'correct' });
    s = recordEvidence(CUR, s, { turnId: 2, conceptId: 'es-copula', kind: 'correct' });
    expect(s.concepts['es-copula'].correctCount).toBe(2);
  });

  it('distinguishes same-turn observations by seq', () => {
    let s = fresh();
    s = recordEvidence(CUR, s, { turnId: 1, kind: 'utterance', detail: 'user: hola', seq: 1 });
    s = recordEvidence(CUR, s, { turnId: 1, kind: 'utterance', detail: 'assistant: hola!', seq: 2 });
    expect(s.evidence.length).toBe(2);
  });

  it('rejects evidence for unknown concepts', () => {
    expect(() =>
      recordEvidence(CUR, fresh(), { turnId: 1, conceptId: 'nope', kind: 'correct' }),
    ).toThrow(/unknown concept/);
  });
});

describe('applyMove bookkeeping', () => {
  it('increments turns, logs decisions, and flips initializing -> teaching', () => {
    const s0 = fresh();
    const s1 = commit(s0, { move: 'introduce_concept', conceptId: 'es-copula' });
    expect(s1.turn).toBe(1);
    expect(s1.status).toBe('teaching');
    expect(s1.moves).toHaveLength(1);
    expect(s1.moves[0].move).toEqual({ move: 'introduce_concept', conceptId: 'es-copula' });
    expect(typeof s1.moves[0].decisionId).toBe('string');
  });

  it('throws on invalid moves instead of mutating', () => {
    const s0 = fresh();
    expect(() =>
      commit(s0, { move: 'introduce_concept', conceptId: 'es-ant-ent-endings' }),
    ).toThrow(/invalid teaching move/);
  });

  it('is immutable: input state is never mutated', () => {
    const s0 = fresh();
    const before = JSON.stringify(s0);
    commit(s0, { move: 'introduce_concept', conceptId: 'es-copula' });
    recordEvidence(CUR, s0, { turnId: 1, conceptId: 'es-copula', kind: 'correct' });
    expect(JSON.stringify(s0)).toBe(before);
  });
});

describe('session lifecycle', () => {
  it('pauses and resumes', () => {
    const s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    const paused = pauseSession(s);
    expect(paused.status).toBe('paused');
    expect(validateMove(CUR, paused, { move: 'probe_understanding', conceptId: 'es-copula' }).ok).toBe(false);
    expect(resumeSession(paused).status).toBe('teaching');
  });

  it('abandons, and abandon is idempotent', () => {
    const s = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    const a1 = abandonSession(s);
    expect(a1.status).toBe('abandoned');
    expect(abandonSession(a1).status).toBe('abandoned');
  });
});
