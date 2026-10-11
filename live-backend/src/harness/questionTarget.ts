/**
 * Bind an assessment to the most recently committed question, never to an
 * arbitrary concept example. Uncommitted free-form Live speech is observed,
 * but must not silently change mastery.
 */
import type { Curriculum } from '../curriculum/types';
import type { HarnessState } from './types';

export interface QuestionTarget {
  conceptId: string;
  expectedAnswers: string[];
  kind: 'discovery' | 'transfer';
  turn: number;
}

export function currentQuestionTarget(curriculum: Curriculum, state: HarnessState): QuestionTarget | null {
  const objective = curriculum.objectives.find((o) => o.id === state.currentObjectiveId);
  if (!objective) return null;
  for (let i = state.moves.length - 1; i >= 0; i--) {
    const decision = state.moves[i];
    const move = decision.move;
    if (move.move === 'advance_objective' || move.move === 'reveal_answer') return null;
    if (move.move === 'ask_discovery_question') {
      if (!objective.conceptIds.includes(move.conceptId)) return null;
      // An open-ended question cannot be confidently auto-graded.
      if (!move.expectedAnswer) return null;
      return { conceptId: move.conceptId, expectedAnswers: [move.expectedAnswer], kind: 'discovery', turn: decision.turn };
    }
    if (move.move === 'test_transfer') {
      if (!objective.conceptIds.includes(move.conceptId)) return null;
      return { conceptId: move.conceptId, expectedAnswers: [move.example], kind: 'transfer', turn: decision.turn };
    }
  }
  return null;
}
