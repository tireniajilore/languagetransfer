/**
 * Curriculum package entry point.
 *
 * Re-exports the subject-agnostic data model and ships the default Spanish
 * module. Additional subjects plug in here without touching the harness.
 */

export * from './types';
export { SPANISH_CURRICULUM_V1 } from './spanish';

import { Curriculum, validateCurriculum } from './types';
import { SPANISH_CURRICULUM_V1 } from './spanish';

/** The curriculum used when none is specified. Validated at import time. */
export const DEFAULT_CURRICULUM: Curriculum = SPANISH_CURRICULUM_V1;

const problems = validateCurriculum(DEFAULT_CURRICULUM);
if (problems.length > 0) {
  throw new Error(
    `default curriculum invalid: ${problems.map((p) => `${p.code}(${p.detail})`).join('; ')}`,
  );
}
