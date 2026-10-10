/**
 * Response-analysis pipeline (Layer C entry point).
 *
 * ADR-001 D4, fast path vs reasoning path:
 *
 *  1. Deterministic scoring FIRST (answerMatch): no model involved.
 *     - `right`   -> record `correct` evidence; choose from precomputed
 *                    teaching options (fast path).
 *     - `unclear` -> record a neutral utterance; stay silent (fast path).
 *                    Silence is cheap; a wrong correction is not.
 *     - `wrong`   -> check registered misconception patterns deterministically;
 *                    on a match, flag it and offer the authored diagnosis
 *                    (fast path). Otherwise escalate.
 *  2. Reasoning path: the utterance needs the delegated backend model
 *     (unfamiliar misconception, ambiguous evidence). The pipeline returns a
 *     delegation request describing what the model must decide; the manager
 *     then runs the model's tool calls through the harness.
 *
 * The pipeline never commits moves itself — it records evidence and returns a
 * routing decision. Commits stay in the ToolRouter's hands.
 */

import { Curriculum } from '../curriculum/types';
import { getTeachingOptions, recordEvidence, TeachingOption } from '../harness/stateMachine';
import { HarnessState } from '../harness/types';
import { matchAnswer, MatchResult } from './answerMatch';

export type AnalysisPath = 'fast' | 'reasoning';

export interface MisconceptionPattern {
  /** Registered curriculum misconception id. */
  misconceptionId: string;
  /** Normalized utterance fragments that deterministically indicate it. */
  fragments: string[];
}

/**
 * Deterministic utterance -> misconception patterns. Conservative by design:
 * only fragments that cannot mean anything else. Anything ambiguous goes to
 * the reasoning path, never to a guessed diagnosis.
 */
export const MISCONCEPTION_PATTERNS: MisconceptionPattern[] = [
  {
    misconceptionId: 'm-quiero-to',
    fragments: ['quiero a ', 'quiero al ', 'quiero de '],
  },
  {
    misconceptionId: 'm-quiero-second-verb',
    fragments: ['quiero cancelo', 'quiero preparo', 'quiero coopero', 'quiero exploro'],
  },
];

export interface AnalysisInput {
  curriculum: Curriculum;
  state: HarnessState;
  /** The learner's utterance (transcript text). */
  utterance: string;
  /** The concept currently being taught. */
  conceptId: string;
  /** Accepted answers for the current prompt. */
  expectedAnswers: string[];
}

export interface AnalysisResult {
  path: AnalysisPath;
  match: MatchResult;
  /** Evidence kind recorded (null when only a neutral utterance was stored). */
  evidenceKind: 'correct' | 'incorrect' | 'unclear' | 'utterance' | null;
  /** Deterministically matched misconception, when any. */
  misconceptionId?: string;
  /** Suggested next moves (fast path only). */
  suggestedMoves: TeachingOption[];
  /**
   * Reasoning-path request: what the delegated backend model must decide.
   * Present only when path === 'reasoning'.
   */
  delegationRequest?: {
    question: string;
    utterance: string;
    match: MatchResult;
  };
  /** Human-readable rationale for logs. */
  rationale: string;
}

function normalizeFragment(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function matchMisconception(utterance: string): string | undefined {
  const norm = normalizeFragment(utterance);
  for (const pattern of MISCONCEPTION_PATTERNS) {
    if (pattern.fragments.some((f) => norm.includes(f))) return pattern.misconceptionId;
  }
  return undefined;
}

/**
 * Analyze one learner response. Pure: reads state, never mutates. Callers
 * record the returned evidence via the harness tools.
 */
export function analyzeResponse(input: AnalysisInput): AnalysisResult {
  const { curriculum, state, utterance, conceptId, expectedAnswers } = input;
  const match = matchAnswer(utterance, expectedAnswers);

  if (match.outcome === 'right') {
    // Suggested moves are computed against the state *after* this correct
    // answer is recorded (on a copy — the pipeline stays pure). That way a
    // correct answer can surface test_transfer instead of options that
    // assume the answer never happened.
    const withEvidence = recordEvidence(
      curriculum,
      state,
      { turnId: state.turn, conceptId, kind: 'correct', detail: `learner said: ${match.heard}` },
      Date.now(),
    );
    return {
      path: 'fast',
      match,
      evidenceKind: 'correct',
      suggestedMoves: getTeachingOptions(curriculum, withEvidence, conceptId).slice(0, 5),
      rationale: `deterministic match: correct ("${match.heard}") — fast path, no delegation`,
    };
  }

  if (match.outcome === 'unclear') {
    return {
      path: 'fast',
      match,
      evidenceKind: 'utterance',
      suggestedMoves: [],
      rationale: `deterministic match: unclear ("${match.heard}") — silence, no correction, no delegation`,
    };
  }

  // match.outcome === 'wrong'
  const misconceptionId = matchMisconception(utterance);
  if (misconceptionId) {
    return {
      path: 'fast',
      match,
      evidenceKind: 'incorrect',
      misconceptionId,
      suggestedMoves: getTeachingOptions(curriculum, state, conceptId).slice(0, 5),
      rationale: `deterministic match: wrong with registered misconception "${misconceptionId}" — fast path, authored diagnosis`,
    };
  }

  return {
    path: 'reasoning',
    match,
    evidenceKind: 'incorrect',
    suggestedMoves: [],
    delegationRequest: {
      question:
        'The learner gave a wrong answer that matches no registered misconception pattern. ' +
        'Assess the evidence, identify the likely misunderstanding, and commit one valid teaching move.',
      utterance,
      match,
    },
    rationale: `deterministic match: wrong but unfamiliar ("${match.heard}") — escalating to delegated reasoning`,
  };
}

/** Should this analysis result delegate to the backend reasoning model? */
export function needsDelegation(result: AnalysisResult): boolean {
  return result.path === 'reasoning';
}
