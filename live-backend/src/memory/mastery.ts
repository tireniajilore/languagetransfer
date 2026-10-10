/**
 * Learner-level mastery derivation (Layer D).
 *
 * The harness state machine owns the single definition of the conservative
 * mastery rule. To derive a learner's cross-session concept status we replay
 * ALL of their evidence for that concept (oldest first) through the pure
 * `recordEvidence` transition on a synthetic state, then read the resulting
 * concept state. There is deliberately no second implementation of the rule.
 *
 * The returned `derivation` object records the exact inputs so every stored
 * estimate in `learner_concepts` is auditable.
 */

import { Curriculum } from '../curriculum/types';
import { createHarnessState, recordEvidence } from '../harness/stateMachine';
import { ConceptStatus, EvidenceKind } from '../harness/types';

/** One evidence row as read back from the `evidence` table. */
export interface EvidenceRow {
  id: number;
  turnId: number;
  seq: number | null;
  conceptId: string | null;
  kind: string;
  detail: string | null;
  misconceptionId: string | null;
  /** Epoch milliseconds. */
  recordedAt: number;
}

export interface DerivedConcept {
  conceptId: string;
  status: ConceptStatus;
  correctCount: number;
  incorrectCount: number;
  transferPassCount: number;
  openMisconceptions: string[];
  derivation: {
    rule: 'conservative-v1';
    minCorrectEvidence: number;
    requireTransferPass: boolean;
    correctCount: number;
    transferPassCount: number;
    openMisconceptions: string[];
    evidenceIds: number[];
  };
}

const KNOWN_KINDS = new Set<EvidenceKind>([
  'correct',
  'incorrect',
  'unclear',
  'hint_used',
  'transfer_pass',
  'transfer_fail',
  'misconception_flagged',
  'utterance',
]);

function isKnownKind(kind: string): kind is EvidenceKind {
  return KNOWN_KINDS.has(kind as EvidenceKind);
}

/**
 * The progression bar for a concept: its objective's rule, or the same
 * fallback the state machine uses for concepts outside any objective.
 * Kept in sync with stateMachine.progressionFor by test.
 */
export function progressionForConcept(
  curriculum: Curriculum,
  conceptId: string,
): { minCorrectEvidence: number; requireTransferPass: boolean } {
  for (const o of curriculum.objectives) {
    if (o.conceptIds.includes(conceptId)) return o.progression;
  }
  return { minCorrectEvidence: 2, requireTransferPass: true };
}

/**
 * Derive the learner-level status for one concept from their full evidence
 * history. Observations (`utterance`, `unclear`, `hint_used`) never move the
 * needle — exactly as in-session.
 */
export function deriveConcept(
  curriculum: Curriculum,
  learnerId: string,
  conceptId: string,
  rows: EvidenceRow[],
): DerivedConcept {
  let synth = createHarnessState({
    sessionId: `derive:${learnerId}:${conceptId}`,
    curriculum,
    learnerId,
  });
  const ordered = [...rows].sort((a, b) => a.recordedAt - b.recordedAt || a.id - b.id);
  for (const r of ordered) {
    if (!isKnownKind(r.kind)) continue;
    try {
      synth = recordEvidence(
        curriculum,
        synth,
        {
          turnId: r.turnId,
          conceptId: r.conceptId ?? conceptId,
          kind: r.kind,
          detail: r.detail ?? undefined,
          misconceptionId: r.misconceptionId ?? undefined,
          // seq namespaces the in-memory dedupe key: evidence from different
          // sessions must never collide inside the synthetic replay.
          seq: r.seq ?? r.id,
        },
        r.recordedAt,
      );
    } catch {
      // Concept vanished from the curriculum (or a malformed row): skip it,
      // keep the rest. Dropping history is worse than dropping one row.
    }
  }
  const cs = synth.concepts[conceptId] ?? {
    status: 'locked' as const,
    correctCount: 0,
    incorrectCount: 0,
    transferPassCount: 0,
    hintsUsed: [],
    openMisconceptions: [],
  };
  const prog = progressionForConcept(curriculum, conceptId);
  return {
    conceptId,
    status: cs.status,
    correctCount: cs.correctCount,
    incorrectCount: cs.incorrectCount,
    transferPassCount: cs.transferPassCount,
    openMisconceptions: [...cs.openMisconceptions],
    derivation: {
      rule: 'conservative-v1',
      minCorrectEvidence: prog.minCorrectEvidence,
      requireTransferPass: prog.requireTransferPass,
      correctCount: cs.correctCount,
      transferPassCount: cs.transferPassCount,
      openMisconceptions: [...cs.openMisconceptions],
      evidenceIds: ordered.map((r) => r.id),
    },
  };
}
