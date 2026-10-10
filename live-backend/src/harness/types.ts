/**
 * Harness domain types.
 *
 * The 12 pedagogical actions from the brief are a validated discriminated
 * union: the Live model (via delegation, PR 3) may *propose* any move, but the
 * state machine validates every move against curriculum + session state before
 * it is committed. Per-move required context is enforced by schema AND by
 * state validation (see stateMachine.ts).
 */

import { z } from 'zod';

export const ConceptIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, 'concept id must be lowercase alphanumeric with dashes');

export const TeachingMoveSchema = z.discriminatedUnion('move', [
  z.object({
    move: z.literal('introduce_concept'),
    conceptId: ConceptIdSchema,
  }),
  z.object({
    move: z.literal('ask_discovery_question'),
    conceptId: ConceptIdSchema,
    /** Optional proposed question text (<=500 chars); the harness does not grade prose. */
    prompt: z.string().min(1).max(500).optional(),
  }),
  z.object({
    move: z.literal('probe_understanding'),
    conceptId: ConceptIdSchema,
  }),
  z.object({
    move: z.literal('give_hint'),
    conceptId: ConceptIdSchema,
    /** Must reference an approved hint; levels must escalate (validated in stateMachine). */
    hintId: z.string().min(1).max(80),
  }),
  z.object({
    move: z.literal('decompose_problem'),
    conceptId: ConceptIdSchema,
    /** Must be actual prerequisites of the concept (validated in stateMachine). */
    subConcepts: z.array(ConceptIdSchema).min(1).max(5),
  }),
  z.object({
    move: z.literal('give_counterexample'),
    conceptId: ConceptIdSchema,
    /** Must be a verified counterexample from the curriculum (hard control). */
    counterexample: z.string().min(1).max(300),
  }),
  z.object({
    move: z.literal('revisit_prerequisite'),
    conceptId: ConceptIdSchema,
    prerequisiteId: ConceptIdSchema,
  }),
  z.object({
    move: z.literal('correct_misconception'),
    conceptId: ConceptIdSchema,
    /** Must be a registered misconception for the concept. */
    misconceptionId: z.string().min(1).max(80),
  }),
  z.object({
    move: z.literal('reveal_answer'),
    conceptId: ConceptIdSchema,
    /** Required: the teacher must say WHY revealing is warranted now. */
    justification: z.string().min(1).max(500),
  }),
  z.object({
    move: z.literal('test_transfer'),
    conceptId: ConceptIdSchema,
    /** Must be unfamiliar: not taught before and not a verified example. */
    example: z.string().min(1).max(300),
  }),
  z.object({
    move: z.literal('reinforce_concept'),
    conceptId: ConceptIdSchema,
  }),
  z.object({
    move: z.literal('advance_objective'),
    objectiveId: z.string().min(1).max(80),
    /** When omitted, advances to the objective's configured next objective (if any). */
    toObjectiveId: z.string().min(1).max(80).optional(),
  }),
]);

export type TeachingMove = z.infer<typeof TeachingMoveSchema>;
export type TeachingMoveKind = TeachingMove['move'];

/** Lifecycle of one concept inside a session. */
export type ConceptStatus =
  | 'locked' // prerequisites not yet mastered
  | 'available' // ready to introduce
  | 'in_progress' // teaching underway
  | 'struggling' // repeated incorrect evidence, needs scaffolding
  | 'mastered'; // derived from evidence, never from a single correct answer

export interface ConceptState {
  status: ConceptStatus;
  /** Count of `correct` evidence records. */
  correctCount: number;
  /** Count of `incorrect` evidence records. */
  incorrectCount: number;
  /** Count of transfer tests passed. */
  transferPassCount: number;
  /** Hint levels already used, in order. */
  hintsUsed: string[];
  /** Misconception ids flagged and not yet resolved. */
  openMisconceptions: string[];
}

export type SessionStatus =
  | 'initializing'
  | 'teaching'
  | 'paused'
  | 'completed'
  | 'abandoned';

/** One committed pedagogical decision (the audit trail). */
export interface CommittedMove {
  decisionId: string;
  /** 1-based turn number; strictly increasing per session. */
  turn: number;
  move: TeachingMove;
  rationale?: string;
  committedAt: number;
}

export type EvidenceKind =
  | 'correct'
  | 'incorrect'
  | 'unclear'
  | 'hint_used'
  | 'transfer_pass'
  | 'transfer_fail'
  | 'misconception_flagged'
  | 'utterance'; // neutral observation (e.g. transcript text), never mastery evidence

/** One recorded observation about the learner. Observations are not mastery. */
export interface EvidenceRecord {
  /** Dedupe key component: repeated records with the same key are ignored. */
  turnId: number;
  conceptId?: string;
  kind: EvidenceKind;
  /** Free-form detail (transcript excerpt, note). Never treated as ground truth. */
  detail?: string;
  misconceptionId?: string;
  /**
   * Optional disambiguator inside the dedupe key (e.g. the observer's
   * per-session utterance counter) so two observations in the same turn
   * do not collide.
   */
  seq?: number;
  recordedAt: number;
}

export interface HarnessState {
  version: 1;
  sessionId: string;
  learnerId?: string;
  curriculumVersion: string;
  subjectId: string;
  status: SessionStatus;
  currentObjectiveId: string;
  /** Number of committed teaching decisions; next commit must use turn+1. */
  turn: number;
  concepts: Record<string, ConceptState>;
  /** Transfer examples already used — test_transfer must pick unfamiliar ones. */
  usedExamples: string[];
  moves: CommittedMove[];
  evidence: EvidenceRecord[];
  createdAt: number;
  updatedAt: number;
}

export interface MoveValidation {
  ok: boolean;
  /** Machine-readable reason when rejected (also logged). */
  reason?: string;
}
