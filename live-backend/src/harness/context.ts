/**
 * Teaching context assembly (pure function).
 *
 * Builds the preloaded context the Live voice model uses on the fast path:
 * current objective, concept statuses, recent moves, and precomputed next
 * teaching options. In PR 3 this is appended to the session as quiet thinking
 * (`session.thinking.append`) as the lesson advances; the `/context` endpoint
 * and `get_learning_context` tool expose it before then.
 */

import { z } from 'zod';
import { Curriculum } from '../curriculum/types';
import { getObjective, getTeachingOptions } from './stateMachine';
import { HarnessState, TeachingMove } from './types';

export const TeachingContextSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  subjectId: z.string(),
  curriculumVersion: z.string(),
  status: z.string(),
  turn: z.number(),
  objective: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    progress: z.object({
      masteredRequired: z.number(),
      requiredTotal: z.number(),
      conceptsTotal: z.number(),
    }),
  }),
  concepts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      correctCount: z.number(),
      incorrectCount: z.number(),
      transferPassCount: z.number(),
      hintsUsed: z.number(),
      openMisconceptions: z.array(z.string()),
    }),
  ),
  recentMoves: z.array(
    z.object({
      turn: z.number(),
      move: z.string(),
      conceptId: z.string().optional(),
      rationale: z.string().optional(),
    }),
  ),
  nextOptions: z.array(
    z.object({
      move: z.string(),
      conceptId: z.string().optional(),
      rationale: z.string(),
    }),
  ),
  /** Compact text rendering for `session.thinking.append` (PR 3). */
  rendered: z.string(),
});

export type TeachingContext = z.infer<typeof TeachingContextSchema>;

function moveConceptId(move: TeachingMove): string | undefined {
  return 'conceptId' in move ? move.conceptId : undefined;
}

/** Assemble the full teaching context from harness state. Pure. */
export function assembleTeachingContext(
  curriculum: Curriculum,
  state: HarnessState,
): TeachingContext {
  const objective = getObjective(curriculum, state);
  const required = objective.progression.requiredConcepts;
  const concepts = objective.conceptIds.map((cid) => {
    const meta = curriculum.concepts.find((c) => c.id === cid);
    const cs = state.concepts[cid];
    return {
      id: cid,
      title: meta?.title ?? cid,
      status: cs?.status ?? 'unknown',
      correctCount: cs?.correctCount ?? 0,
      incorrectCount: cs?.incorrectCount ?? 0,
      transferPassCount: cs?.transferPassCount ?? 0,
      hintsUsed: cs?.hintsUsed.length ?? 0,
      openMisconceptions: cs?.openMisconceptions ?? [],
    };
  });

  const recentMoves = state.moves.slice(-5).map((m) => ({
    turn: m.turn,
    move: m.move.move,
    conceptId: moveConceptId(m.move),
    rationale: m.rationale,
  }));

  const nextOptions = getTeachingOptions(curriculum, state)
    .slice(0, 5)
    .map((o) => ({
      move: o.move.move,
      conceptId: moveConceptId(o.move),
      rationale: o.rationale,
    }));

  const lines: string[] = [];
  lines.push(`Objective: ${objective.title}`);
  lines.push(`Progress: ${required.filter((c) => state.concepts[c]?.status === 'mastered').length}/${required.length} required concepts mastered (turn ${state.turn}, status ${state.status}).`);
  lines.push('Concepts:');
  for (const c of concepts) {
    const extra =
      c.openMisconceptions.length > 0 ? ` [open misconceptions: ${c.openMisconceptions.join(', ')}]` : '';
    lines.push(
      `- ${c.title} [${c.status}] correct=${c.correctCount} incorrect=${c.incorrectCount} transferPass=${c.transferPassCount} hintsUsed=${c.hintsUsed}${extra}`,
    );
  }
  if (recentMoves.length > 0) {
    lines.push('Recent moves:');
    for (const m of recentMoves) {
      lines.push(`- t${m.turn}: ${m.move}${m.conceptId ? `(${m.conceptId})` : ''}`);
    }
  }
  lines.push('Valid next moves (choose among these; anything else will be rejected):');
  for (const o of nextOptions) {
    lines.push(`- ${o.move}${o.conceptId ? `(${o.conceptId})` : ''}: ${o.rationale}`);
  }

  return {
    version: 1,
    sessionId: state.sessionId,
    subjectId: state.subjectId,
    curriculumVersion: state.curriculumVersion,
    status: state.status,
    turn: state.turn,
    objective: {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      progress: {
        masteredRequired: required.filter((c) => state.concepts[c]?.status === 'mastered').length,
        requiredTotal: required.length,
        conceptsTotal: objective.conceptIds.length,
      },
    },
    concepts,
    recentMoves,
    nextOptions,
    rendered: lines.join('\n'),
  };
}
