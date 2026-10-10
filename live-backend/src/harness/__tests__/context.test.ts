import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import { assembleTeachingContext, TeachingContextSchema } from '../context';
import { applyMove, createHarnessState, recordEvidence } from '../stateMachine';

const CUR = SPANISH_CURRICULUM_V1;

describe('assembleTeachingContext', () => {
  it('matches its schema and reflects the current state', () => {
    let s = createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 });
    s = applyMove(CUR, s, { move: 'introduce_concept', conceptId: 'es-copula' }, { now: 1_000 });
    s = recordEvidence(CUR, s, { turnId: 2, conceptId: 'es-copula', kind: 'incorrect' }, 1_000);
    const ctx = assembleTeachingContext(CUR, s);
    expect(() => TeachingContextSchema.parse(ctx)).not.toThrow();
    expect(ctx.sessionId).toBe('s1');
    expect(ctx.turn).toBe(1);
    expect(ctx.objective.id).toBe('es-obj-cognates');
    const copula = ctx.concepts.find((c) => c.id === 'es-copula')!;
    expect(copula.status).toBe('in_progress');
    expect(copula.incorrectCount).toBe(1);
  });

  it('renders a compact text block naming the objective, statuses, and options', () => {
    const s = createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 });
    const ctx = assembleTeachingContext(CUR, s);
    expect(ctx.rendered).toContain('Objective: Think in cognates');
    expect(ctx.rendered).toContain('[available]');
    expect(ctx.rendered).toContain('[locked]');
    expect(ctx.rendered).toContain('Valid next moves');
    expect(ctx.rendered).toContain('introduce_concept(es-copula)');
    // compact enough for a thinking-context append
    expect(ctx.rendered.length).toBeLessThan(4000);
  });

  it('reflects advancement to the next objective', () => {
    let s = createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 });
    for (const cid of ['es-copula', 'es-al-endings', 'es-ant-ent-endings']) {
      s = recordEvidence(CUR, s, { turnId: 1, conceptId: cid, kind: 'correct' }, 1_000);
      s = recordEvidence(CUR, s, { turnId: 2, conceptId: cid, kind: 'correct' }, 1_000);
      s = recordEvidence(CUR, s, { turnId: 3, conceptId: cid, kind: 'transfer_pass' }, 1_000);
    }
    s = applyMove(CUR, s, { move: 'advance_objective', objectiveId: 'es-obj-cognates' }, { now: 1_000 });
    const ctx = assembleTeachingContext(CUR, s);
    expect(ctx.objective.id).toBe('es-obj-quiero');
    expect(ctx.objective.title).toContain('quiero');
    expect(ctx.rendered).toContain('Wanting and doing');
  });

  it('is pure: repeated calls return equal values without mutating state', () => {
    const s = createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 });
    const a = assembleTeachingContext(CUR, s);
    const b = assembleTeachingContext(CUR, s);
    expect(a).toEqual(b);
  });
});
