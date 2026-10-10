import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import {
  applyMove,
  createHarnessState,
  getTeachingOptions,
  recordEvidence,
  validateMove,
} from '../stateMachine';
import { EvidenceKind, HarnessState, TeachingMove } from '../types';

/** Deterministic PRNG (mulberry32) so the "random" walk is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUR = SPANISH_CURRICULUM_V1;
const EVIDENCE_KINDS: EvidenceKind[] = ['correct', 'incorrect', 'unclear', 'transfer_pass', 'transfer_fail'];

function checkInvariants(s: HarnessState): string[] {
  const violations: string[] = [];
  if (s.turn !== s.moves.length) violations.push(`turn ${s.turn} != moves ${s.moves.length}`);
  const turns = s.moves.map((m) => m.turn);
  for (let i = 1; i < turns.length; i++) {
    if (turns[i] !== turns[i - 1] + 1) violations.push('turns not strictly increasing');
  }
  const seenExamples = new Set<string>();
  for (const e of s.usedExamples) {
    if (seenExamples.has(e)) violations.push(`duplicate used example "${e}"`);
    seenExamples.add(e);
  }
  for (const [cid, cs] of Object.entries(s.concepts)) {
    const concept = CUR.concepts.find((c) => c.id === cid)!;
    if (cs.status === 'mastered') {
      if (cs.correctCount < 2) violations.push(`${cid} mastered with <2 correct`);
      if (cs.transferPassCount < 1) violations.push(`${cid} mastered without transfer pass`);
      if (cs.openMisconceptions.length > 0) violations.push(`${cid} mastered with open misconceptions`);
    }
    if ((cs.status === 'in_progress' || cs.status === 'struggling' || cs.status === 'mastered')) {
      for (const p of concept.prerequisites) {
        if (s.concepts[p]?.status !== 'mastered') {
          violations.push(`${cid} active while prerequisite ${p} is ${s.concepts[p]?.status}`);
        }
      }
    }
    for (let i = 1; i < cs.hintsUsed.length; i++) {
      const prev = CUR.hints.find((h) => h.id === cs.hintsUsed[i - 1])!;
      const cur = CUR.hints.find((h) => h.id === cs.hintsUsed[i])!;
      if (cur.level !== prev.level + 1) violations.push(`${cid} hints not escalating`);
    }
  }
  // every committed move must have been valid at commit time — replay check
  // is covered by applyMove throwing; here we check move history well-formedness
  for (const m of s.moves) {
    if (!m.decisionId || typeof m.turn !== 'number') violations.push('malformed committed move');
  }
  return violations;
}

describe('state machine invariants under random valid walks', () => {
  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}: invariants hold across 300 random steps`, () => {
      const rand = mulberry32(seed);
      let s = createHarnessState({ sessionId: `walk-${seed}`, curriculum: CUR, now: 1_000 });
      let now = 1_000;
      for (let step = 0; step < 300; step++) {
        now += 1;
        const roll = rand();
        if (roll < 0.45) {
          // commit a random valid option
          const options = getTeachingOptions(CUR, s);
          if (options.length === 0) break;
          const pick = options[Math.floor(rand() * options.length)];
          const v = validateMove(CUR, s, pick.move);
          expect(v.ok).toBe(true);
          s = applyMove(CUR, s, pick.move as TeachingMove, { now });
        } else if (roll < 0.9) {
          // record random evidence against a random concept of the objective
          const cids = CUR.objectives.flatMap((o) => o.conceptIds);
          const cid = cids[Math.floor(rand() * cids.length)];
          const kind = EVIDENCE_KINDS[Math.floor(rand() * EVIDENCE_KINDS.length)];
          s = recordEvidence(CUR, s, { turnId: Math.floor(rand() * 20), conceptId: cid, kind }, now);
        } else {
          // propose a random (possibly invalid) move: must either validate or throw, never corrupt
          const cids = CUR.objectives.flatMap((o) => o.conceptIds);
          const cid = cids[Math.floor(rand() * cids.length)];
          const candidate = { move: 'introduce_concept', conceptId: cid };
          const v = validateMove(CUR, s, candidate);
          if (v.ok) {
            s = applyMove(CUR, s, candidate, { now });
          } else {
            expect(() => applyMove(CUR, s, candidate, { now })).toThrow();
          }
        }
        const violations = checkInvariants(s);
        expect(violations).toEqual([]);
      }
    });
  }

  it('a full objective can be completed through the walk', () => {
    // Deterministic scripted completion: master every required concept, advance.
    let s = createHarnessState({ sessionId: 'scripted', curriculum: CUR, now: 1_000 });
    for (const cid of ['es-copula', 'es-al-endings', 'es-ant-ent-endings']) {
      s = recordEvidence(CUR, s, { turnId: 1, conceptId: cid, kind: 'correct' }, 1_000);
      s = recordEvidence(CUR, s, { turnId: 2, conceptId: cid, kind: 'correct' }, 1_000);
      s = recordEvidence(CUR, s, { turnId: 3, conceptId: cid, kind: 'transfer_pass' }, 1_000);
      expect(s.concepts[cid].status).toBe('mastered');
    }
    s = applyMove(CUR, s, { move: 'advance_objective', objectiveId: 'es-obj-cognates' }, { now: 1_000 });
    expect(s.currentObjectiveId).toBe('es-obj-quiero');
    expect(checkInvariants(s)).toEqual([]);
  });
});
