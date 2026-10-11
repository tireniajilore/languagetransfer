/**
 * Objective-based teaching state machine (Layer B, pure TypeScript).
 *
 * This is the authoritative owner of teaching state. The Live voice model may
 * *propose* moves (via delegation in PR 3); only this module *commits* them,
 * and every commit passes `validateMove` first. All functions are pure —
 * they take a state and return a new state — so the logic is fully testable
 * without I/O and shared by every tool handler.
 *
 * Hard controls enforced here (never left to the model):
 *  - concepts unlock only when prerequisites are mastered (no skipping)
 *  - hints escalate strictly (no jumping to the most helpful hint)
 *  - counterexamples must be curriculum-verified (no invented examples)
 *  - transfer tests must use unfamiliar examples
 *  - answers are revealed only after recorded struggle (no premature reveals)
 *  - objectives advance only when progression evidence exists
 *  - misconception corrections must reference registered misconceptions
 */

import { randomUUID } from 'node:crypto';
import {
  Concept,
  Curriculum,
  Hint,
  LearningObjective,
  validateCurriculum,
} from '../curriculum/types';
import {
  CommittedMove,
  ConceptState,
  ConceptStatus,
  EvidenceKind,
  EvidenceRecord,
  HarnessState,
  MoveValidation,
  TeachingMove,
  TeachingMoveSchema,
} from './types';

export interface CreateStateOptions {
  sessionId: string;
  curriculum: Curriculum;
  learnerId?: string;
  objectiveId?: string;
  now?: number;
}

function freshConceptState(): ConceptState {
  return {
    status: 'locked',
    correctCount: 0,
    incorrectCount: 0,
    transferPassCount: 0,
    hintsUsed: [],
    openMisconceptions: [],
  };
}

/** A concept is available iff every prerequisite is mastered. */
function computeAvailability(
  concept: Concept,
  concepts: Record<string, ConceptState>,
): ConceptStatus {
  const current = concepts[concept.id]?.status;
  if (current === 'mastered' || current === 'struggling' || current === 'in_progress') {
    return current;
  }
  const prereqsMet = concept.prerequisites.every((p) => concepts[p]?.status === 'mastered');
  return prereqsMet ? 'available' : 'locked';
}

function refreshAvailability(
  curriculum: Curriculum,
  concepts: Record<string, ConceptState>,
): Record<string, ConceptState> {
  const next: Record<string, ConceptState> = {};
  for (const c of curriculum.concepts) {
    const cs = concepts[c.id] ?? freshConceptState();
    next[c.id] = { ...cs, status: computeAvailability(c, concepts) };
  }
  return next;
}

/** Create the initial harness state for a session. Throws on invalid curriculum. */
export function createHarnessState(opts: CreateStateOptions): HarnessState {
  const problems = validateCurriculum(opts.curriculum);
  if (problems.length > 0) {
    throw new Error(
      `cannot create harness state: curriculum invalid: ${problems.map((p) => p.code).join(', ')}`,
    );
  }
  const now = opts.now ?? Date.now();
  const objective =
    opts.curriculum.objectives.find((o) => o.id === opts.objectiveId) ??
    opts.curriculum.objectives[0];
  if (!objective) throw new Error('curriculum has no objectives');

  const concepts: Record<string, ConceptState> = {};
  for (const c of opts.curriculum.concepts) concepts[c.id] = freshConceptState();
  const withAvailability = refreshAvailability(opts.curriculum, concepts);

  return {
    version: 1,
    sessionId: opts.sessionId,
    learnerId: opts.learnerId,
    curriculumVersion: opts.curriculum.version,
    subjectId: opts.curriculum.subjectId,
    status: 'initializing',
    currentObjectiveId: objective.id,
    turn: 0,
    concepts: withAvailability,
    usedExamples: [],
    moves: [],
    evidence: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Prior learner knowledge used to seed a new session (PR 4 restore).
 * Comes from the `learner_concepts` table: inferred mastery derived from
 * all of the learner's past evidence.
 */
export interface RestoredConcept {
  status: ConceptStatus;
  correctCount: number;
  incorrectCount: number;
  transferPassCount: number;
  openMisconceptions: string[];
}

/**
 * Overlay prior learner knowledge onto a fresh session state.
 *
 * Mastered concepts stay mastered (their introductions are skipped by
 * getTeachingOptions); concepts with open misconceptions resume in progress
 * with the flags carried over; everything else keeps fresh availability.
 * Unknown concept ids (curriculum changed since the knowledge was recorded)
 * are ignored. Pure — safe to test without I/O.
 */
export function restoreConcepts(
  curriculum: Curriculum,
  state: HarnessState,
  restored: Record<string, RestoredConcept>,
): HarnessState {
  const concepts: Record<string, ConceptState> = { ...state.concepts };
  for (const [id, r] of Object.entries(restored)) {
    if (!getConcept(curriculum, id)) continue;
    const base = concepts[id] ?? freshConceptState();
    const keep: ConceptStatus =
      r.status === 'mastered' || r.status === 'struggling' || r.status === 'in_progress'
        ? r.status
        : base.status;
    concepts[id] = {
      ...base,
      status: keep,
      correctCount: r.correctCount,
      incorrectCount: r.incorrectCount,
      transferPassCount: r.transferPassCount,
      openMisconceptions: [...r.openMisconceptions],
      hintsUsed: [],
    };
    if (keep === 'available' && (r.correctCount > 0 || r.incorrectCount > 0)) {
      // Real prior evidence on an available concept: work had started.
      concepts[id] = { ...concepts[id], status: 'in_progress' };
    }
  }
  return { ...state, concepts: refreshAvailability(curriculum, concepts), updatedAt: Date.now() };
}

export function getObjective(curriculum: Curriculum, state: HarnessState): LearningObjective {
  const o = curriculum.objectives.find((x) => x.id === state.currentObjectiveId);
  if (!o) throw new Error(`state references unknown objective "${state.currentObjectiveId}"`);
  return o;
}

export function getConcept(curriculum: Curriculum, conceptId: string): Concept | undefined {
  return curriculum.concepts.find((c) => c.id === conceptId);
}

function hintsFor(curriculum: Curriculum, conceptId: string): Hint[] {
  return curriculum.hints
    .filter((h) => h.conceptId === conceptId)
    .sort((a, b) => a.level - b.level);
}

function maxHintLevelUsed(curriculum: Curriculum, cs: ConceptState): number {
  let max = 0;
  for (const hid of cs.hintsUsed) {
    const h = curriculum.hints.find((x) => x.id === hid);
    if (h && h.level > max) max = h.level;
  }
  return max;
}

function misconceptionRegistered(
  curriculum: Curriculum,
  conceptId: string,
  misconceptionId: string,
): boolean {
  return curriculum.misconceptions.some(
    (m) => m.id === misconceptionId && m.conceptId === conceptId,
  );
}

function conceptInCurrentObjective(
  curriculum: Curriculum,
  state: HarnessState,
  conceptId: string,
): boolean {
  return getObjective(curriculum, state).conceptIds.includes(conceptId);
}

type MoveTarget = Extract<TeachingMove, { conceptId: string }>;

function checkConceptTarget(
  curriculum: Curriculum,
  state: HarnessState,
  move: MoveTarget,
  allowed: ConceptStatus[],
): MoveValidation {
  const concept = getConcept(curriculum, move.conceptId);
  if (!concept) return { ok: false, reason: `unknown concept "${move.conceptId}"` };
  if (!conceptInCurrentObjective(curriculum, state, move.conceptId)) {
    return {
      ok: false,
      reason: `concept "${move.conceptId}" is not in the current objective "${state.currentObjectiveId}"`,
    };
  }
  const cs = state.concepts[move.conceptId];
  if (!cs || !allowed.includes(cs.status)) {
    return {
      ok: false,
      reason: `move "${move.move}" not allowed for concept "${move.conceptId}" with status "${cs?.status}"`,
    };
  }
  return { ok: true };
}

/**
 * Validate a proposed teaching move against curriculum + session state.
 * The move is first schema-checked (zod) by the tool router; this checks the
 * *stateful* rules — the hard pedagogical controls.
 */
export function validateMove(
  curriculum: Curriculum,
  state: HarnessState,
  rawMove: unknown,
): MoveValidation {
  if (state.status !== 'teaching' && state.status !== 'initializing') {
    return { ok: false, reason: `session is "${state.status}"; moves require an active session` };
  }
  const parsed = TeachingMoveSchema.safeParse(rawMove);
  if (!parsed.success) {
    return { ok: false, reason: `move failed schema validation: ${parsed.error.issues[0]?.message}` };
  }
  const move = parsed.data;

  switch (move.move) {
    case 'introduce_concept':
      return checkConceptTarget(curriculum, state, move, ['available']);

    case 'ask_discovery_question': {
      const base = checkConceptTarget(curriculum, state, move, ['available', 'in_progress', 'struggling']);
      if (!base.ok) return base;
      if (move.expectedAnswer && !getConcept(curriculum, move.conceptId)?.verifiedExamples.includes(move.expectedAnswer)) {
        return { ok: false, reason: 'expectedAnswer must be a verified example for this concept' };
      }
      return { ok: true };
    }
    case 'probe_understanding':
    case 'reinforce_concept':
      return checkConceptTarget(curriculum, state, move, ['available', 'in_progress', 'struggling']);

    case 'give_hint': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      const hints = hintsFor(curriculum, move.conceptId);
      const hint = hints.find((h) => h.id === move.hintId);
      if (!hint) {
        return { ok: false, reason: `hint "${move.hintId}" is not an approved hint for "${move.conceptId}"` };
      }
      const expectedLevel = maxHintLevelUsed(curriculum, state.concepts[move.conceptId]) + 1;
      if (hint.level !== expectedLevel) {
        return {
          ok: false,
          reason: `hints must escalate: next allowed level is ${expectedLevel}, got level ${hint.level}`,
        };
      }
      return { ok: true };
    }

    case 'decompose_problem': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      const concept = getConcept(curriculum, move.conceptId);
      const bad = move.subConcepts.filter((s) => !concept?.prerequisites.includes(s));
      if (bad.length > 0) {
        return {
          ok: false,
          reason: `decompose_problem sub-concepts must be prerequisites of "${move.conceptId}": ${bad.join(', ')} are not`,
        };
      }
      return { ok: true };
    }

    case 'give_counterexample': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      const concept = getConcept(curriculum, move.conceptId);
      if (!concept?.counterexamples.includes(move.counterexample)) {
        return {
          ok: false,
          reason: `counterexample is not curriculum-verified for "${move.conceptId}" — invented examples are not allowed`,
        };
      }
      return { ok: true };
    }

    case 'revisit_prerequisite': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      const concept = getConcept(curriculum, move.conceptId);
      if (!concept?.prerequisites.includes(move.prerequisiteId)) {
        return {
          ok: false,
          reason: `"${move.prerequisiteId}" is not a prerequisite of "${move.conceptId}"`,
        };
      }
      return { ok: true };
    }

    case 'correct_misconception': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      if (!misconceptionRegistered(curriculum, move.conceptId, move.misconceptionId)) {
        return {
          ok: false,
          reason: `misconception "${move.misconceptionId}" is not registered for "${move.conceptId}"`,
        };
      }
      return { ok: true };
    }

    case 'reveal_answer': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      const cs = state.concepts[move.conceptId];
      const struggled = cs.hintsUsed.length > 0 || cs.incorrectCount > 0;
      if (!struggled) {
        return {
          ok: false,
          reason: `reveal_answer requires recorded struggle first (a hint given or an incorrect answer) for "${move.conceptId}" — no premature reveals`,
        };
      }
      return { ok: true };
    }

    case 'test_transfer': {
      const base = checkConceptTarget(curriculum, state, move, ['in_progress', 'struggling']);
      if (!base.ok) return base;
      const concept = getConcept(curriculum, move.conceptId);
      if (concept?.verifiedExamples.includes(move.example)) {
        return {
          ok: false,
          reason: `transfer example was already taught for "${move.conceptId}" — transfer tests must use unfamiliar examples`,
        };
      }
      if (state.usedExamples.includes(move.example)) {
        return {
          ok: false,
          reason: `transfer example was already used this session — pick an unfamiliar one`,
        };
      }
      return { ok: true };
    }

    case 'advance_objective': {
      if (move.objectiveId !== state.currentObjectiveId) {
        return {
          ok: false,
          reason: `can only advance the current objective "${state.currentObjectiveId}", got "${move.objectiveId}"`,
        };
      }
      const objective = getObjective(curriculum, state);
      const unmastered = objective.progression.requiredConcepts.filter(
        (cid) => state.concepts[cid]?.status !== 'mastered',
      );
      if (unmastered.length > 0) {
        return {
          ok: false,
          reason: `progression blocked: required concepts not yet mastered: ${unmastered.join(', ')}`,
        };
      }
      const target = move.toObjectiveId ?? objective.nextObjectiveId;
      if (move.toObjectiveId && move.toObjectiveId !== objective.nextObjectiveId) {
        return {
          ok: false,
          reason: `objectives advance in curriculum order; "${move.toObjectiveId}" is not the next objective`,
        };
      }
      if (target && !curriculum.objectives.some((o) => o.id === target)) {
        return { ok: false, reason: `unknown target objective "${target}"` };
      }
      return { ok: true };
    }
  }
}

export interface ApplyMoveOptions {
  decisionId?: string;
  rationale?: string;
  now?: number;
}

/**
 * Commit a validated move. Returns the new state. Throws if the move is
 * invalid — callers must run `validateMove` first (the tool router does).
 */
export function applyMove(
  curriculum: Curriculum,
  state: HarnessState,
  rawMove: unknown,
  opts: ApplyMoveOptions = {},
): HarnessState {
  const validation = validateMove(curriculum, state, rawMove);
  if (!validation.ok) {
    throw new Error(`invalid teaching move: ${validation.reason}`);
  }
  const move = TeachingMoveSchema.parse(rawMove);
  const now = opts.now ?? Date.now();
  const turn = state.turn + 1;
  const committed: CommittedMove = {
    decisionId: opts.decisionId ?? randomUUID(),
    turn,
    move,
    rationale: opts.rationale,
    committedAt: now,
  };

  const concepts: Record<string, ConceptState> = { ...state.concepts };
  const get = (id: string): ConceptState => ({ ...(concepts[id] ?? freshConceptState()) });

  // Any teaching move against an available concept starts work on it.
  if ('conceptId' in move) {
    const cs = get(move.conceptId);
    if (cs.status === 'available') {
      concepts[move.conceptId] = { ...cs, status: 'in_progress' };
    }
  }

  let usedExamples = state.usedExamples;
  if (move.move === 'give_hint' && 'conceptId' in move) {
    const cs = get(move.conceptId);
    concepts[move.conceptId] = { ...cs, hintsUsed: [...cs.hintsUsed, move.hintId] };
  }
  if (move.move === 'test_transfer') {
    usedExamples = [...state.usedExamples, move.example];
  }

  let { status, currentObjectiveId } = state;
  if (move.move === 'advance_objective') {
    const objective = getObjective(curriculum, state);
    const target = move.toObjectiveId ?? objective.nextObjectiveId;
    if (target) {
      currentObjectiveId = target;
    } else {
      status = 'completed';
    }
  }
  if (status === 'initializing') status = 'teaching';

  const next: HarnessState = {
    ...state,
    status,
    currentObjectiveId,
    turn,
    concepts: refreshAvailability(curriculum, concepts),
    usedExamples,
    moves: [...state.moves, committed],
    updatedAt: now,
  };
  return next;
}

export interface EvidenceInput {
  turnId: number;
  conceptId?: string;
  kind: EvidenceKind;
  detail?: string;
  misconceptionId?: string;
  seq?: number;
}

function evidenceKey(e: EvidenceInput): string {
  return `${e.turnId}:${e.kind}:${e.conceptId ?? ''}:${e.misconceptionId ?? ''}:${e.seq ?? ''}`;
}

function progressionFor(
  curriculum: Curriculum,
  state: HarnessState,
  conceptId: string,
): { minCorrectEvidence: number; requireTransferPass: boolean } {
  const objective = getObjective(curriculum, state);
  if (objective.conceptIds.includes(conceptId)) return objective.progression;
  return { minCorrectEvidence: 2, requireTransferPass: true };
}

/**
 * Record one observation. Idempotent: a repeated record with the same
 * (turnId, kind, conceptId, misconceptionId) is ignored. Out-of-order turnIds
 * are accepted — mastery is derived from counts, not arrival order.
 *
 * Mastery rule (conservative, per ADR-001 D6): a concept becomes `mastered`
 * only with >= minCorrectEvidence correct records AND a transfer pass (when
 * required) AND no open misconception flags. A single correct answer never
 * implies mastery.
 */
export function recordEvidence(
  curriculum: Curriculum,
  state: HarnessState,
  input: EvidenceInput,
  now: number = Date.now(),
): HarnessState {
  if (input.conceptId && !getConcept(curriculum, input.conceptId)) {
    throw new Error(`unknown concept "${input.conceptId}"`);
  }
  const key = evidenceKey(input);
  const seen = new Set(state.evidence.map((e) => evidenceKey(e)));
  if (seen.has(key)) return state; // duplicate — ignore, do not double-count

  const record: EvidenceRecord = { ...input, recordedAt: now };
  const evidence = [...state.evidence, record];

  const concepts: Record<string, ConceptState> = { ...state.concepts };
  if (input.conceptId) {
    const cs: ConceptState = { ...(concepts[input.conceptId] ?? freshConceptState()) };
    switch (input.kind) {
      case 'correct':
        cs.correctCount += 1;
        // A correct answer after a flag resolves the flagged misconceptions.
        cs.openMisconceptions = [];
        break;
      case 'incorrect':
        cs.incorrectCount += 1;
        break;
      case 'transfer_pass':
        cs.transferPassCount += 1;
        cs.correctCount += 1;
        cs.openMisconceptions = [];
        break;
      case 'transfer_fail':
        cs.incorrectCount += 1;
        break;
      case 'misconception_flagged':
        if (input.misconceptionId && !cs.openMisconceptions.includes(input.misconceptionId)) {
          cs.openMisconceptions = [...cs.openMisconceptions, input.misconceptionId];
        }
        break;
      case 'hint_used':
      case 'unclear':
      case 'utterance':
        break;
    }

    if (cs.status !== 'mastered' && cs.status !== 'locked') {
      const prog = progressionFor(curriculum, state, input.conceptId);
      const mastered =
        cs.openMisconceptions.length === 0 &&
        cs.correctCount >= prog.minCorrectEvidence &&
        (!prog.requireTransferPass || cs.transferPassCount >= 1);
      if (mastered) {
        cs.status = 'mastered';
      } else if (cs.incorrectCount >= 3) {
        cs.status = 'struggling';
      } else if (cs.status === 'available' && input.kind !== 'utterance') {
        // Real learner evidence on an available concept starts work on it.
        // Evidence for a *locked* concept only accumulates counts — the
        // concept cannot activate until its prerequisites are mastered
        // (refreshAvailability handles the unlock).
        cs.status = 'in_progress';
      }
    }
    concepts[input.conceptId] = cs;
  }

  return {
    ...state,
    concepts: refreshAvailability(curriculum, concepts),
    evidence,
    updatedAt: now,
  };
}

/** Session lifecycle transitions. */
export function pauseSession(state: HarnessState, now: number = Date.now()): HarnessState {
  if (state.status !== 'teaching') throw new Error(`cannot pause a "${state.status}" session`);
  return { ...state, status: 'paused', updatedAt: now };
}

export function resumeSession(state: HarnessState, now: number = Date.now()): HarnessState {
  if (state.status !== 'paused') throw new Error(`cannot resume a "${state.status}" session`);
  return { ...state, status: 'teaching', updatedAt: now };
}

export function abandonSession(state: HarnessState, now: number = Date.now()): HarnessState {
  if (state.status === 'completed' || state.status === 'abandoned') return state;
  return { ...state, status: 'abandoned', updatedAt: now };
}

export interface TeachingOption {
  move: TeachingMove;
  /** Why this option is pedagogically sensible right now (for the fast-path context). */
  rationale: string;
}

/**
 * Precomputed valid next moves for the current state — the fast-path teaching
 * context. Pure and deterministic; the Live model (PR 3) chooses among these
 * or delegates for deeper reasoning. Ordered pedagogically.
 */
export function getTeachingOptions(
  curriculum: Curriculum,
  state: HarnessState,
  conceptId?: string,
): TeachingOption[] {
  if (state.status !== 'teaching' && state.status !== 'initializing') return [];
  const objective = getObjective(curriculum, state);
  const targets = conceptId
    ? [conceptId]
    : objective.conceptIds.filter((cid) => {
        const s = state.concepts[cid]?.status;
        return s === 'available' || s === 'in_progress' || s === 'struggling';
      });

  const options: TeachingOption[] = [];
  const tryPush = (move: unknown, rationale: string): void => {
    if (options.length >= 12) return;
    if (validateMove(curriculum, state, move).ok) {
      options.push({ move: TeachingMoveSchema.parse(move), rationale });
    }
  };

  for (const cid of targets) {
    const cs = state.concepts[cid];
    const concept = getConcept(curriculum, cid);
    if (!cs || !concept) continue;

    if (cs.status === 'available') {
      tryPush({ move: 'introduce_concept', conceptId: cid }, `introduce "${concept.title}" — prerequisites met, not yet started`);
    }
    tryPush(
      { move: 'ask_discovery_question', conceptId: cid },
      `guide discovery on "${concept.title}" with a carefully chosen question`,
    );
    if (cs.status === 'in_progress' || cs.status === 'struggling') {
      const hints = hintsFor(curriculum, cid);
      const nextLevel = maxHintLevelUsed(curriculum, cs) + 1;
      const nextHint = hints.find((h) => h.level === nextLevel);
      if (nextHint) {
        tryPush(
          { move: 'give_hint', conceptId: cid, hintId: nextHint.id },
          `escalating hint (level ${nextHint.level}) preserves productive struggle`,
        );
      }
      tryPush(
        { move: 'probe_understanding', conceptId: cid },
        `check whether "${concept.title}" is understood or guessed`,
      );
      for (const m of curriculum.misconceptions.filter((x) => x.conceptId === cid)) {
        tryPush(
          { move: 'correct_misconception', conceptId: cid, misconceptionId: m.id },
          `address registered misconception: ${m.description}`,
        );
      }
      const unusedTransfer = concept.transferExamples.find((e) => !state.usedExamples.includes(e));
      if (unusedTransfer && cs.correctCount > 0) {
        tryPush(
          { move: 'test_transfer', conceptId: cid, example: unusedTransfer },
          `verify understanding transfers to an unfamiliar example`,
        );
      }
      if (cs.status === 'struggling') {
        for (const p of concept.prerequisites) {
          tryPush(
            { move: 'revisit_prerequisite', conceptId: cid, prerequisiteId: p },
            `struggling — rebuild from prerequisite "${p}"`,
          );
        }
        if (concept.prerequisites.length > 0) {
          tryPush(
            {
              move: 'decompose_problem',
              conceptId: cid,
              subConcepts: concept.prerequisites.slice(0, 2),
            },
            `break "${concept.title}" into its prerequisite steps`,
          );
        }
      }
      const ce = concept.counterexamples[0];
      if (ce) {
        tryPush(
          { move: 'give_counterexample', conceptId: cid, counterexample: ce },
          `sharpen the boundary of "${concept.title}" with a verified counterexample`,
        );
      }
      tryPush(
        { move: 'reinforce_concept', conceptId: cid },
        `reinforce the reasoning process behind "${concept.title}"`,
      );
    }
  }

  // Objective advancement is always surfaced when valid.
  tryPush(
    { move: 'advance_objective', objectiveId: objective.id },
    `all required concepts mastered — advance the objective`,
  );

  return options;
}
