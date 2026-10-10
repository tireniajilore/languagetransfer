/**
 * Pedagogical evaluation dataset (PR 3).
 *
 * Simulated learner interactions on the real Spanish curriculum material.
 * This file holds ONLY utterances and expectations — no prompts, no policy.
 * The policy lives in `buildBackendInstructions`; the runner
 * (`pedagogical.test.ts`) applies deterministic checks:
 *
 * - appropriateness of the teaching move (acceptableMoves),
 * - misconception recognition (misconceptionId),
 * - no premature reveals (noPrematureReveal),
 * - scaffolding quality (hint escalation across struggle turns).
 *
 * Case ids are stable (`pq-NN`) so regressions can be tracked across runs.
 */

export type ExpectedOutcome = 'right' | 'wrong' | 'unclear';

export interface PedagogicalTurn {
  utterance: string;
  expectedAnswers: string[];
}

export interface PedagogicalCase {
  id: string;
  description: string;
  conceptId: string;
  turns: PedagogicalTurn[];
  expectedOutcomes: ExpectedOutcome[];
  /** Misconception that must be flagged on the matching turn, if any. */
  misconceptionId?: string;
  /** Turn index (0-based) where the misconception must be flagged. */
  misconceptionTurn?: number;
  /** At least one of these moves must be suggested after the final turn. */
  acceptableMoves?: string[];
  /** reveal_answer must never be suggested in this case. */
  noPrematureReveal: boolean;
}

export const PEDAGOGICAL_CASES: PedagogicalCase[] = [
  {
    id: 'pq-01',
    description: 'Clean correct answer on the copula: test transfer, do not assume mastery.',
    conceptId: 'es-copula',
    turns: [{ utterance: 'es', expectedAnswers: ['es'] }],
    expectedOutcomes: ['right'],
    acceptableMoves: ['test_transfer', 'probe_understanding', 'reinforce_concept'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-02',
    description: 'Hesitant but correct: ignorable words must not penalize.',
    conceptId: 'es-copula',
    turns: [{ utterance: 'um, es', expectedAnswers: ['es'] }],
    expectedOutcomes: ['right'],
    acceptableMoves: ['test_transfer', 'probe_understanding', 'reinforce_concept'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-03',
    description: 'Registered misconception: inserting "a" between quiero and the infinitive.',
    conceptId: 'es-quiero-infinitive',
    turns: [{ utterance: 'quiero a cancelar', expectedAnswers: ['quiero cancelar'] }],
    expectedOutcomes: ['wrong'],
    misconceptionId: 'm-quiero-to',
    misconceptionTurn: 0,
    acceptableMoves: ['correct_misconception', 'give_hint', 'decompose_problem', 'ask_discovery_question'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-04',
    description: 'Registered misconception: conjugating the second verb.',
    conceptId: 'es-quiero-infinitive',
    turns: [{ utterance: 'quiero cancelo', expectedAnswers: ['quiero cancelar'] }],
    expectedOutcomes: ['wrong'],
    misconceptionId: 'm-quiero-second-verb',
    misconceptionTurn: 0,
    acceptableMoves: ['correct_misconception', 'give_hint', 'decompose_problem'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-05',
    description: 'Unfamiliar wrong answer: escalate to delegated reasoning, do not guess.',
    conceptId: 'es-copula',
    turns: [{ utterance: 'eso', expectedAnswers: ['es'] }],
    expectedOutcomes: ['wrong'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-06',
    description: 'Off-task speech: stay silent, record nothing assessable.',
    conceptId: 'es-copula',
    turns: [{ utterance: 'sorry, what did you say', expectedAnswers: ['es'] }],
    expectedOutcomes: ['unclear'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-07',
    description: 'Added negation flips meaning: a real wrong attempt, not noise.',
    conceptId: 'es-quiero-want',
    turns: [{ utterance: 'no quiero', expectedAnswers: ['quiero'] }],
    expectedOutcomes: ['wrong'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-08',
    description: 'Repeated struggle then repair: incorrect x2, then correct.',
    conceptId: 'es-copula',
    turns: [
      { utterance: 'eh', expectedAnswers: ['es'] },
      { utterance: 'eso', expectedAnswers: ['es'] },
      { utterance: 'es', expectedAnswers: ['es'] },
    ],
    expectedOutcomes: ['unclear', 'wrong', 'right'],
    acceptableMoves: ['test_transfer', 'probe_understanding', 'reinforce_concept', 'give_hint'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-09',
    description: 'Short-target robustness: "esta" for "es" is an attempt, not noise.',
    conceptId: 'es-copula',
    turns: [{ utterance: 'esta', expectedAnswers: ['es'] }],
    expectedOutcomes: ['wrong'],
    noPrematureReveal: true,
  },
  {
    id: 'pq-10',
    description: 'Emphatic pronoun form is correct Spanish, not an error.',
    conceptId: 'es-quiero-want',
    turns: [{ utterance: 'yo quiero', expectedAnswers: ['quiero'] }],
    expectedOutcomes: ['right'],
    acceptableMoves: ['test_transfer', 'probe_understanding', 'reinforce_concept'],
    noPrematureReveal: true,
  },
];

/** Misconception ids referenced by the dataset must exist in the curriculum. */
export function datasetMisconceptionIds(): string[] {
  return PEDAGOGICAL_CASES.filter((c) => c.misconceptionId).map(
    (c) => c.misconceptionId as string,
  );
}
