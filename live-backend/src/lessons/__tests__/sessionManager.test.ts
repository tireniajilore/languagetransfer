import { describe, expect, it } from 'vitest';
import { CourseStore } from '../courseStore';
import { LessonSessionManager, cueInstructions, lessonInstructions } from '../sessionManager';

describe('live lesson instances', () => {
  it('scopes tutor instructions to a numbered lesson with no topic selection', () => {
    const instructions = lessonInstructions(2, 'Thinking Method');
    expect(instructions).toContain('LESSON 2');
    expect(instructions).toContain('Never ask what the learner would like to study');
    expect(instructions).toContain('Wait for the application START cue');
  });

  it('works through the actual Lesson 2, then unlocks Lesson 3', async () => {
    const course = new CourseStore();
    const manager = new LessonSessionManager(course);
    await expect(manager.prepare('s3', 'learner-a', 3)).rejects.toThrow('locked');
    await manager.prepare('s2', 'learner-a', 2);
    const first = await manager.start('s2');
    expect(first?.teacherLines.join(' ')).toContain('English and Spanish');
    expect(first?.question).toContain('metal');
    expect(cueInstructions(first!)).toContain('WAIT for the learner');
    expect(await manager.start('s2')).toBeNull(); // no duplicate opening

    let cue = first!;
    let count = 0;
    while (!cue.complete && count++ < 100) {
      const target = cue.expectedAnswers?.[0] ?? 'I think I recognize the pattern';
      const result = await manager.hear('s2', target);
      expect(result?.accepted).toBe(true);
      expect(result?.cue).toBeTruthy();
      cue = result!.cue!;
    }
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(100);
    expect(cue.complete).toBe(true);
    await manager.prepare('s3', 'learner-a', 3);
    expect((await manager.start('s3'))?.lessonNumber).toBe(3);
    expect((await course.overview('learner-a')).find((x) => x.number === 3)?.status)
      .toBe('in_progress');
    expect((await course.overview('learner-b')).find((x) => x.number === 3)?.status)
      .toBe('locked');
  });

  it('preserves cursor across voice sessions without restarting the lesson', async () => {
    const course = new CourseStore();
    const first = new LessonSessionManager(course);
    await first.prepare('old', 'learner-a', 2);
    await first.start('old');
    const res = await first.hear('old', 'metal');
    expect(res?.correct).toBe(true);
    const at = res!.cursor.stepIndex;
    first.forgetSession('old');
    const second = new LessonSessionManager(course);
    await second.prepare('new', 'learner-a', 2);
    expect(second.get('new')?.cursor.stepIndex).toBe(at);
    const cue = await second.start('new');
    expect(cue?.question).toContain('he is normal');
  });
});
