/**
 * Pedagogical evaluation runner (PR 3).
 *
 * Runs every case in `dataset.ts` through the real analysis pipeline +
 * harness (no mocks except the absence of the OpenAI boundary — no delegation
 * is invoked; reasoning-path cases assert the escalation, not the model's
 * answer). Deterministic checks:
 *
 * - outcome per turn matches the labelled expectation,
 * - registered misconceptions are flagged on the right turn,
 * - suggested moves are pedagogically appropriate (acceptableMoves),
 * - reveal_answer is never suggested prematurely,
 * - every referenced misconception exists in the curriculum.
 */
import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import { analyzeResponse } from '../analysis';
import { getTeachingOptions, recordEvidence } from '../../harness/stateMachine';
import { datasetMisconceptionIds, PEDAGOGICAL_CASES, PedagogicalCase } from './dataset';
import { HarnessFixture, makeHarness } from '../__tests__/helpers';

/** Objective containing a concept (every case concept belongs to exactly one). */
function objectiveFor(conceptId: string): string {
  const objective = SPANISH_CURRICULUM_V1.objectives.find((o) => o.conceptIds.includes(conceptId));
  if (!objective) throw new Error(`no objective contains concept "${conceptId}"`);
  return objective.id;
}

/**
 * Master a concept's prerequisites recursively so the case concept becomes
 * available — the legitimate path, no shortcuts.
 */
function unlockPrerequisites(fx: HarnessFixture, conceptId: string, counter: { n: number }): void {
  const concept = SPANISH_CURRICULUM_V1.concepts.find((c) => c.id === conceptId);
  if (!concept) throw new Error(`unknown concept "${conceptId}"`);
  for (const prereq of concept.prerequisites) {
    unlockPrerequisites(fx, prereq, counter);
    const state = fx.store.get(fx.sessionId);
    if (state?.concepts[prereq]?.status === 'mastered') continue;
    for (const kind of ['correct', 'correct', 'transfer_pass'] as const) {
      counter.n += 1;
      fx.store.update(fx.sessionId, (s) =>
        recordEvidence(SPANISH_CURRICULUM_V1, s, { turnId: counter.n, conceptId: prereq, kind }, 1_000),
      );
    }
  }
}

function runCase(c: PedagogicalCase) {
  const fx = makeHarness(`pq-${c.id}`, 1_000, objectiveFor(c.conceptId));
  const counter = { n: 100 };
  unlockPrerequisites(fx, c.conceptId, counter);
  const introduced = fx.router.dispatch({
    sessionId: fx.sessionId,
    tool: 'commit_teaching_decision',
    input: { turnId: 1, move: { move: 'introduce_concept', conceptId: c.conceptId } },
  });
  if (!introduced.ok) {
    throw new Error(`pq setup failed for ${c.id}: ${introduced.error?.code} ${introduced.error?.detail}`);
  }

  const outcomes: string[] = [];
  const flagged: Array<string | undefined> = [];
  let lastMoves: string[] = [];
  let turnId = 2;

  for (const turn of c.turns) {
    const state = fx.store.get(fx.sessionId);
    if (!state) throw new Error('no state');
    const result = analyzeResponse({
      curriculum: SPANISH_CURRICULUM_V1,
      state,
      utterance: turn.utterance,
      conceptId: c.conceptId,
      expectedAnswers: turn.expectedAnswers,
    });
    outcomes.push(result.match.outcome);
    flagged.push(result.misconceptionId);
    if (result.evidenceKind && result.evidenceKind !== 'utterance') {
      fx.router.dispatch({
        sessionId: fx.sessionId,
        tool: 'assess_understanding',
        input: {
          turnId,
          conceptId: c.conceptId,
          evidence: {
            kind: result.evidenceKind,
            ...(result.misconceptionId ? { misconceptionId: result.misconceptionId } : {}),
          },
        },
      });
      turnId += 1;
    }
    const after = fx.store.get(fx.sessionId);
    if (!after) throw new Error('no state');
    lastMoves = getTeachingOptions(SPANISH_CURRICULUM_V1, after, c.conceptId).map((o) => o.move.move);
  }
  return { outcomes, flagged, lastMoves };
}

describe('pedagogical eval dataset', () => {
  it('every referenced misconception exists in the curriculum', () => {
    const ids = new Set(SPANISH_CURRICULUM_V1.misconceptions.map((m) => m.id));
    for (const id of datasetMisconceptionIds()) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('every referenced concept exists in the curriculum', () => {
    const ids = new Set(SPANISH_CURRICULUM_V1.concepts.map((c) => c.id));
    for (const c of PEDAGOGICAL_CASES) {
      expect(ids.has(c.conceptId), c.id).toBe(true);
    }
  });

  for (const c of PEDAGOGICAL_CASES) {
    it(`${c.id}: ${c.description}`, () => {
      const { outcomes, flagged, lastMoves } = runCase(c);
      expect(outcomes, `${c.id} outcomes`).toEqual(c.expectedOutcomes);
      if (c.misconceptionId !== undefined) {
        expect(flagged[c.misconceptionTurn ?? 0], `${c.id} misconception`).toBe(c.misconceptionId);
      }
      if (c.noPrematureReveal) {
        expect(lastMoves, `${c.id} no premature reveal`).not.toContain('reveal_answer');
      }
      if (c.acceptableMoves) {
        const hit = lastMoves.some((m) => c.acceptableMoves?.includes(m));
        expect(hit, `${c.id} acceptable moves (got: ${lastMoves.join(',')})`).toBe(true);
      }
    });
  }
});
