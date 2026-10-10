import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../spanish';
import { Curriculum, validateCurriculum } from '../types';

describe('spanish v1 curriculum', () => {
  it('passes validation', () => {
    expect(validateCurriculum(SPANISH_CURRICULUM_V1)).toEqual([]);
  });

  it('covers the first substantive concepts of lessons 02-04', () => {
    const ids = SPANISH_CURRICULUM_V1.concepts.map((c) => c.id);
    for (const expected of [
      'es-copula',
      'es-al-endings',
      'es-ant-ent-endings',
      'es-quiero-want',
      'es-quiero-infinitive',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('has an objective chain covering the concepts', () => {
    const all = new Set(SPANISH_CURRICULUM_V1.objectives.flatMap((o) => o.conceptIds));
    for (const c of SPANISH_CURRICULUM_V1.concepts) {
      expect(all.has(c.id)).toBe(true);
    }
    expect(SPANISH_CURRICULUM_V1.objectives[0].nextObjectiveId).toBe(
      SPANISH_CURRICULUM_V1.objectives[1].id,
    );
  });
});

function broken(base: Curriculum, mutate: (c: Curriculum) => void): Curriculum {
  const copy: Curriculum = JSON.parse(JSON.stringify(base));
  mutate(copy);
  return copy;
}

describe('validateCurriculum', () => {
  it('rejects prerequisite cycles', () => {
    const c = broken(SPANISH_CURRICULUM_V1, (x) => {
      x.concepts.find((k) => k.id === 'es-al-endings')!.prerequisites = ['es-ant-ent-endings'];
    });
    const problems = validateCurriculum(c);
    expect(problems.some((p) => p.code === 'prerequisite-cycle')).toBe(true);
  });

  it('rejects dangling prerequisites', () => {
    const c = broken(SPANISH_CURRICULUM_V1, (x) => {
      x.concepts.find((k) => k.id === 'es-copula')!.prerequisites = ['nope'];
    });
    expect(validateCurriculum(c).some((p) => p.code === 'dangling-prerequisite')).toBe(true);
  });

  it('rejects non-contiguous hint levels', () => {
    const c = broken(SPANISH_CURRICULUM_V1, (x) => {
      x.hints.push({ id: 'h-bad', conceptId: 'es-copula', level: 5, text: 'bad' });
    });
    expect(validateCurriculum(c).some((p) => p.code === 'hint-level-gap')).toBe(true);
  });

  it('rejects transfer examples that overlap taught examples', () => {
    const c = broken(SPANISH_CURRICULUM_V1, (x) => {
      const k = x.concepts.find((k) => k.id === 'es-copula')!;
      k.transferExamples = [...k.transferExamples, k.verifiedExamples[0]];
    });
    expect(validateCurriculum(c).some((p) => p.code === 'transfer-overlap')).toBe(true);
  });

  it('rejects misconceptions pointing at unknown concepts', () => {
    const c = broken(SPANISH_CURRICULUM_V1, (x) => {
      x.misconceptions[0].conceptId = 'nope';
    });
    expect(validateCurriculum(c).some((p) => p.code === 'dangling-misconception')).toBe(true);
  });

  it('rejects objectives advancing to unknown objectives', () => {
    const c = broken(SPANISH_CURRICULUM_V1, (x) => {
      x.objectives[0].nextObjectiveId = 'nope';
    });
    expect(validateCurriculum(c).some((p) => p.code === 'dangling-next-objective')).toBe(true);
  });
});
