import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 as curriculum } from '../../curriculum/spanish';
import { applyMove, createHarnessState, validateMove } from '../stateMachine';
import { currentQuestionTarget } from '../questionTarget';

const fresh = () => createHarnessState({ sessionId: 's1', curriculum, now: 1000 });
const commit = (state: ReturnType<typeof fresh>, move: unknown) =>
  applyMove(curriculum, state, move, { now: 1100 });

describe('question-bound assessment', () => {
  it('does not automatically grade uncommitted or open-ended speech', () => {
    let state = fresh();
    expect(currentQuestionTarget(curriculum, state)).toBeNull();
    state = commit(state, { move: 'introduce_concept', conceptId: 'es-copula' });
    state = commit(state, { move: 'ask_discovery_question', conceptId: 'es-copula', prompt: 'What do you notice?' });
    expect(currentQuestionTarget(curriculum, state)).toBeNull();
  });

  it('grades a committed question against only its approved target', () => {
    let state = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    const question = { move: 'ask_discovery_question', conceptId: 'es-copula', prompt: 'How do you say it is normal?', expectedAnswer: 'es normal' };
    expect(validateMove(curriculum, state, question).ok).toBe(true);
    expect(validateMove(curriculum, state, { ...question, expectedAnswer: 'unverified response' }).ok).toBe(false);
    state = commit(state, question);
    expect(currentQuestionTarget(curriculum, state)).toMatchObject({
      conceptId: 'es-copula', expectedAnswers: ['es normal'], kind: 'discovery',
    });
  });

  it('distinguishes unfamiliar transfer questions from discovery questions', () => {
    let state = commit(fresh(), { move: 'introduce_concept', conceptId: 'es-copula' });
    state = commit(state, { move: 'test_transfer', conceptId: 'es-copula', example: 'es posible' });
    expect(currentQuestionTarget(curriculum, state)).toMatchObject({ kind: 'transfer', expectedAnswers: ['es posible'] });
  });
});
