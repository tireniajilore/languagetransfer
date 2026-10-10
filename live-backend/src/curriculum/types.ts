/**
 * Subject-agnostic curriculum data model.
 *
 * The teaching harness (Layer B) depends only on these generic
 * concept/objective interfaces — never on Spanish-specific rules. Subject
 * modules (e.g. `spanish.ts`) supply verified knowledge: objectives, concepts,
 * prerequisites, misconceptions, approved hints, and progression conditions.
 *
 * Versioned: curricula carry a `version` string so the harness and learner
 * memory (PR 4) can distinguish content revisions.
 */

export type ConceptId = string;
export type ObjectiveId = string;
export type SubjectId = string;

/** A single teachable unit of understanding. */
export interface Concept {
  /** Stable id, e.g. "es-quiero-want". */
  id: ConceptId;
  title: string;
  /** One-paragraph summary of the understanding the learner should derive. */
  summary: string;
  /** Concepts that must be mastered before this one becomes available. */
  prerequisites: ConceptId[];
  /** Verified target-language examples the teacher may use. */
  verifiedExamples: string[];
  /**
   * Verified counterexamples for `give_counterexample`. Every entry must be
   * factually correct in the subject; the harness rejects any counterexample
   * not listed here (hard control against invented examples).
   */
  counterexamples: string[];
  /**
   * Suggested unfamiliar examples for `test_transfer`. Must NOT overlap
   * `verifiedExamples`; the harness additionally rejects any transfer example
   * the learner has already seen in this session.
   */
  transferExamples: string[];
}

/** A commonly observed wrong turn, with an approved way to address it. */
export interface Misconception {
  id: string;
  conceptId: ConceptId;
  /** What the learner appears to believe. */
  description: string;
  /**
   * Authored, subject-verified guidance for the teacher. The model may select
   * this misconception but must not invent its own diagnosis text.
   */
  teacherGuidance: string;
}

/**
 * One step of escalating scaffolding. Levels start at 1 and must be
 * contiguous per concept; the harness enforces strictly escalating order
 * (no skipping to the most helpful hint first).
 */
export interface Hint {
  id: string;
  conceptId: ConceptId;
  level: number;
  /** Authored, verified hint text. */
  text: string;
}

/** When a concept may be considered mastered (all must hold). */
export interface ProgressionCondition {
  /** Concepts that must reach `mastered` before the objective completes. */
  requiredConcepts: ConceptId[];
  /**
   * Minimum number of `correct` evidence records per required concept.
   * A correct answer is evidence, never mastery by itself.
   */
  minCorrectEvidence: number;
  /** At least one transfer test must be passed per required concept. */
  requireTransferPass: boolean;
}

export interface LearningObjective {
  id: ObjectiveId;
  subjectId: SubjectId;
  title: string;
  description: string;
  /** Concepts taught under this objective (ordered for suggested sequencing). */
  conceptIds: ConceptId[];
  /** Concepts with no prerequisites inside this objective — where teaching starts. */
  entryConceptIds: ConceptId[];
  progression: ProgressionCondition;
  /** Id of the objective that follows, if any. */
  nextObjectiveId?: ObjectiveId;
}

export interface Curriculum {
  version: string;
  subjectId: SubjectId;
  subjectName: string;
  concepts: Concept[];
  objectives: LearningObjective[];
  misconceptions: Misconception[];
  hints: Hint[];
}

export interface CurriculumValidationError {
  code: string;
  detail: string;
}

function err(code: string, detail: string): CurriculumValidationError {
  return { code, detail };
}

/**
 * Validate a curriculum definition. Returns a list of problems; empty means
 * valid. Checks: id uniqueness, reference integrity, prerequisite acyclicity,
 * hint level contiguity, transfer/verified example disjointness.
 */
export function validateCurriculum(c: Curriculum): CurriculumValidationError[] {
  const problems: CurriculumValidationError[] = [];
  const conceptIds = new Set(c.concepts.map((x) => x.id));
  const objectiveIds = new Set(c.objectives.map((o) => o.id));

  const seen = new Set<string>();
  for (const concept of c.concepts) {
    if (seen.has(concept.id)) problems.push(err('duplicate-concept', `duplicate concept id "${concept.id}"`));
    seen.add(concept.id);
  }

  for (const concept of c.concepts) {
    for (const p of concept.prerequisites) {
      if (!conceptIds.has(p)) {
        problems.push(err('dangling-prerequisite', `concept "${concept.id}" requires unknown concept "${p}"`));
      }
      if (p === concept.id) {
        problems.push(err('self-prerequisite', `concept "${concept.id}" lists itself as a prerequisite`));
      }
    }
    const overlap = concept.verifiedExamples.filter((e) => concept.transferExamples.includes(e));
    if (overlap.length > 0) {
      problems.push(
        err('transfer-overlap', `concept "${concept.id}" lists taught examples as transfer examples: ${overlap.join(', ')}`),
      );
    }
  }

  // Prerequisite cycle detection (DFS).
  const byId = new Map(c.concepts.map((x) => [x.id, x]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      problems.push(err('prerequisite-cycle', `cycle detected: ${[...path, id].join(' -> ')}`));
      return;
    }
    visiting.add(id);
    for (const p of byId.get(id)?.prerequisites ?? []) {
      if (conceptIds.has(p)) visit(p, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of conceptIds) visit(id, []);

  for (const o of c.objectives) {
    for (const cid of o.conceptIds) {
      if (!conceptIds.has(cid)) {
        problems.push(err('dangling-objective-concept', `objective "${o.id}" references unknown concept "${cid}"`));
      }
    }
    for (const cid of o.entryConceptIds) {
      if (!o.conceptIds.includes(cid)) {
        problems.push(err('entry-not-in-objective', `objective "${o.id}" entry concept "${cid}" not in its concept list`));
      }
    }
    for (const cid of o.progression.requiredConcepts) {
      if (!o.conceptIds.includes(cid)) {
        problems.push(err('progression-outside-objective', `objective "${o.id}" requires concept "${cid}" outside its concept list`));
      }
    }
    if (o.nextObjectiveId && !objectiveIds.has(o.nextObjectiveId)) {
      problems.push(err('dangling-next-objective', `objective "${o.id}" points to unknown objective "${o.nextObjectiveId}"`));
    }
  }

  for (const m of c.misconceptions) {
    if (!conceptIds.has(m.conceptId)) {
      problems.push(err('dangling-misconception', `misconception "${m.id}" references unknown concept "${m.conceptId}"`));
    }
  }

  const hintsByConcept = new Map<string, Hint[]>();
  for (const h of c.hints) {
    if (!conceptIds.has(h.conceptId)) {
      problems.push(err('dangling-hint', `hint "${h.id}" references unknown concept "${h.conceptId}"`));
      continue;
    }
    const list = hintsByConcept.get(h.conceptId) ?? [];
    list.push(h);
    hintsByConcept.set(h.conceptId, list);
  }
  for (const [cid, list] of hintsByConcept) {
    const levels = list.map((h) => h.level).sort((a, b) => a - b);
    for (let i = 0; i < levels.length; i++) {
      if (levels[i] !== i + 1) {
        problems.push(err('hint-level-gap', `concept "${cid}" hint levels must be 1..n contiguous (got ${levels.join(',')})`));
        break;
      }
    }
    const ids = new Set(list.map((h) => h.id));
    if (ids.size !== list.length) {
      problems.push(err('duplicate-hint', `concept "${cid}" has duplicate hint ids`));
    }
  }

  return problems;
}
