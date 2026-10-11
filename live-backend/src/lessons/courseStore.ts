import type { Pool } from 'pg';
import { availableLessonNumbers, freshCursor, getAuthoredLesson,
  type LessonCursor } from './conductor';

export interface CourseRow {
  number: number;
  title: string;
  status: 'available' | 'in_progress' | 'completed' | 'locked' | 'missing';
  stepIndex: number;
  totalSteps: number;
}
export class CourseLockedError extends Error {}

export class CourseStore {
  private readonly memory = new Map<string, Map<number, LessonCursor>>();
  constructor(private readonly pool?: Pool) {}

  async load(learnerId: string): Promise<Map<number, LessonCursor>> {
    if (this.pool) {
      const r = await this.pool.query(
        'SELECT lesson_number, step_index, phase, attempts, updated_at FROM lesson_progress WHERE learner_id = $1',
        [learnerId],
      );
      return new Map(r.rows.map((x: { lesson_number: number; step_index: number;
        phase: LessonCursor['phase']; attempts: number; updated_at: Date }) => [
        x.lesson_number, {
          lessonNumber: x.lesson_number, stepIndex: x.step_index,
          phase: x.phase, attempts: x.attempts, updatedAt: x.updated_at.getTime(),
        } as LessonCursor,
      ]));
    }
    return new Map(this.memory.get(learnerId) ?? []);
  }

  /** The missing canonical Lesson 25 is an explicit blocking gap, not silently skipped. */
  async overview(learnerId: string): Promise<CourseRow[]> {
    const saved = await this.load(learnerId);
    const available = new Set(availableLessonNumbers());
    const rows: CourseRow[] = [];
    let unlocked = true;
    for (let number = 2; number <= 90; number++) {
      if (!available.has(number)) {
        rows.push({ number, title: 'Source lesson not yet available', status: 'missing', stepIndex: 0, totalSteps: 0 });
        unlocked = false;
        continue;
      }
      const lesson = getAuthoredLesson(number);
      const cursor = saved.get(number);
      const complete = cursor?.phase === 'completed' && cursor.stepIndex === lesson.steps.length;
      const status = complete ? 'completed' : unlocked
        ? cursor && cursor.stepIndex > 0 ? 'in_progress' : 'available' : 'locked';
      rows.push({ number, title: lesson.title, status,
        stepIndex: cursor ? Math.max(0, cursor.stepIndex - (cursor.phase === 'awaiting_answer' ? 1 : 0)) : 0, totalSteps: lesson.steps.length });
      unlocked = unlocked && complete;
    }
    return rows;
  }

  async requireUnlocked(learnerId: string, number: number): Promise<LessonCursor> {
    const row = (await this.overview(learnerId)).find((x) => x.number === number);
    if (!row || row.status === 'locked' || row.status === 'missing') {
      throw new CourseLockedError(`Lesson ${number} is locked until every previous lesson is completed`);
    }
    return (await this.load(learnerId)).get(number) ?? freshCursor(number);
  }

  /** Save only a valid forward transition, never a client-submitted arbitrary cursor. */
  async save(learnerId: string, cursor: LessonCursor): Promise<void> {
    const lesson = getAuthoredLesson(cursor.lessonNumber);
    if (cursor.stepIndex < 0 || cursor.stepIndex > lesson.steps.length) throw new Error('bad cursor');
    if (cursor.phase === 'completed' && cursor.stepIndex !== lesson.steps.length) throw new Error('incomplete lesson');
    if (this.pool) {
      await this.pool.query(`INSERT INTO lesson_progress
        (learner_id, lesson_number, step_index, phase, attempts, updated_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (learner_id, lesson_number) DO UPDATE SET
          step_index = EXCLUDED.step_index, phase = EXCLUDED.phase,
          attempts = EXCLUDED.attempts, updated_at = now()
        WHERE lesson_progress.step_index <= EXCLUDED.step_index
          AND lesson_progress.phase <> 'completed'`,
        [learnerId, cursor.lessonNumber, cursor.stepIndex, cursor.phase, cursor.attempts],
      );
    } else {
      let m = this.memory.get(learnerId);
      if (!m) { m = new Map(); this.memory.set(learnerId, m); }
      const old = m.get(cursor.lessonNumber);
      if (!old || (old.phase !== 'completed' && old.stepIndex <= cursor.stepIndex))
        m.set(cursor.lessonNumber, { ...cursor });
    }
  }
}
