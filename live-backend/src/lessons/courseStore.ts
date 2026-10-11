import type { Pool } from 'pg';
import { CheckpointStore } from './checkpointStore';
import { getTeachingSpec } from './teachingSpec';
import { availableLessonNumbers } from './conductor';

export interface CourseRow {
  number: number;
  title: string;
  status: 'available' | 'in_progress' | 'completed' | 'locked' | 'missing';
  stepIndex: number;
  totalSteps: number;
  reviewed: boolean;
}
export class CourseLockedError extends Error {}

export class CourseStore {
  readonly checkpoints: CheckpointStore;
  constructor(pool?: Pool) {
    this.checkpoints = new CheckpointStore(pool);
  }

  /** The missing canonical Lesson 25 is an explicit blocking gap, not silently skipped. */
  async overview(learnerId: string): Promise<CourseRow[]> {
    const saved = await this.checkpoints.loadAll(learnerId);
    const available = new Set(availableLessonNumbers());
    const rows: CourseRow[] = [];
    let unlocked = true;
    for (let number = 2; number <= 90; number++) {
      if (!available.has(number)) {
        rows.push({
          number,
          title: 'Source lesson not yet available',
          status: 'missing',
          stepIndex: 0,
          totalSteps: 0,
          reviewed: false,
        });
        unlocked = false;
        continue;
      }
      const lesson = getTeachingSpec(number);
      const cursor = saved.get(number);
      const complete =
        cursor?.phase === 'completed' &&
        cursor.receipts.length === lesson.steps.length;
      const status = complete
        ? 'completed'
        : unlocked
          ? cursor && cursor.stepIndex > 0
            ? 'in_progress'
            : 'available'
          : 'locked';
      rows.push({
        number,
        title: lesson.title,
        status,
        stepIndex: cursor?.stepIndex ?? 0,
        totalSteps: lesson.steps.length,
        reviewed: lesson.reviewStatus === 'transcript-audited',
      });
      unlocked = unlocked && complete;
    }
    return rows;
  }

  async requireUnlocked(learnerId: string, number: number): Promise<void> {
    const row = (await this.overview(learnerId)).find(
      (x) => x.number === number,
    );
    if (!row || row.status === 'locked' || row.status === 'missing') {
      throw new CourseLockedError(
        `Lesson ${number} is locked until every previous lesson is completed`,
      );
    }
  }
}
