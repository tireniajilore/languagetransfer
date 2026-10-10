/**
 * Scaffolding selection (Layer C helpers).
 *
 * Hint escalation is enforced by the harness state machine (levels must rise
 * contiguously); this module exposes the deterministic "next hint" choice so
 * the delegated backend model selects among AUTHORDED hints rather than
 * inventing its own. Transfer examples are drawn only from the curriculum's
 * `transferExamples` for the concept and only from ones the learner has not
 * seen in this session — the harness additionally rejects familiar ones at
 * commit time (defense in depth).
 */

import { Curriculum, Hint } from '../curriculum/types';
import { HarnessState } from '../harness/types';

/** The next escalating hint for a concept, or undefined when exhausted. */
export function selectNextHint(curriculum: Curriculum, state: HarnessState, conceptId: string): Hint | undefined {
  const hints = curriculum.hints
    .filter((h) => h.conceptId === conceptId)
    .sort((a, b) => a.level - b.level);
  const used = state.concepts[conceptId]?.hintsUsed ?? [];
  return hints.find((h) => !used.includes(h.id));
}

/**
 * An unfamiliar transfer example for a concept: from the curriculum's
 * transferExamples, excluding anything the learner has already seen in this
 * session (usedExamples) and anything in verifiedExamples.
 */
export function selectTransferExample(
  curriculum: Curriculum,
  state: HarnessState,
  conceptId: string,
): string | undefined {
  const concept = curriculum.concepts.find((c) => c.id === conceptId);
  if (!concept) return undefined;
  const seen = new Set(state.usedExamples);
  return concept.transferExamples.find((e) => !seen.has(e));
}

/** Mark an example as used so future transfer tests stay unfamiliar. */
export function markExampleUsed(examples: string[], example: string): string[] {
  return examples.includes(example) ? examples : [...examples, example];
}
