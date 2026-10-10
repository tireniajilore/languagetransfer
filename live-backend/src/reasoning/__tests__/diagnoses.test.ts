/**
 * Authored diagnosis catalogue tests: the leak guard over every entry, the
 * classify-not-generate contract, and linkage to registered curriculum
 * misconceptions.
 */
import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import {
  assertNoAnswerLeak,
  auditCatalogueLeaks,
  DIAGNOSES,
  diagnosesForConcept,
  diagnosisMenu,
  findDiagnosis,
  isSelectable,
} from '../diagnoses';

describe('diagnosis catalogue', () => {
  it('has no answer leaks in any authored correction', () => {
    expect(auditCatalogueLeaks()).toEqual([]);
  });

  it('each entry individually passes the leak guard', () => {
    for (const d of DIAGNOSES) {
      expect(assertNoAnswerLeak(d), d.id).toEqual([]);
    }
  });

  it('every entry links to a real curriculum concept', () => {
    const conceptIds = new Set(SPANISH_CURRICULUM_V1.concepts.map((c) => c.id));
    for (const d of DIAGNOSES) {
      expect(conceptIds.has(d.conceptId), d.id).toBe(true);
    }
  });

  it('misconception links resolve to registered curriculum misconceptions', () => {
    const miscIds = new Set(SPANISH_CURRICULUM_V1.misconceptions.map((m) => m.id));
    for (const d of DIAGNOSES) {
      if (d.misconceptionId) {
        expect(miscIds.has(d.misconceptionId), d.id).toBe(true);
        const m = SPANISH_CURRICULUM_V1.misconceptions.find((x) => x.id === d.misconceptionId);
        expect(m?.conceptId, d.id).toBe(d.conceptId);
      }
    }
  });

  it('spoken-only diagnoses are excluded from the typed menu', () => {
    const spoken = diagnosisMenu('spoken');
    const typed = diagnosisMenu('typed');
    expect(spoken).toContain('english-sounds');
    expect(typed).not.toContain('english-sounds');
    expect(typed).toContain('none:');
    expect(isSelectable('english-sounds', 'typed')).toBe(false);
    expect(isSelectable('english-sounds', 'spoken')).toBe(true);
  });

  it('none is always selectable', () => {
    expect(isSelectable('none', 'spoken')).toBe(true);
    expect(isSelectable('none', 'typed')).toBe(true);
  });

  it('diagnosesForConcept only returns that concept', () => {
    for (const d of diagnosesForConcept('es-quiero-infinitive')) {
      expect(d.conceptId).toBe('es-quiero-infinitive');
    }
    expect(diagnosesForConcept('es-quiero-infinitive').length).toBeGreaterThan(0);
  });

  it('findDiagnosis returns undefined for unknown ids', () => {
    expect(findDiagnosis('nope')).toBeUndefined();
  });
});
