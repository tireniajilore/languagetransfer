import { describe, expect, it } from 'vitest';
import { availableLessonNumbers, getAuthoredLesson, freshCursor, nextCue,
  respondToQuestion, confirmOpenPrompt } from '../conductor';
import { CourseStore } from '../courseStore';

describe('fixed Language Transfer lesson conductor', () => {
  const lesson = getAuthoredLesson(2);
  it('uses the canonical authored lesson sequence, not a generic curriculum', () => {
    expect(lesson.title).toContain('Latin Cognates');
    const first = nextCue(lesson, freshCursor(2));
    expect(first.cue.teacherLines.join(' ')).toContain('English and Spanish');
    expect(first.cue.question).toContain('metal');
    expect(first.cursor.phase).toBe('awaiting_answer');
    expect(first.cue.expectedAnswers).toContain('metal');
  });
  it('holds position on mistakes, then advances in order', () => {
    const initial = nextCue(lesson, freshCursor(2));
    const wrong = respondToQuestion(lesson, initial.cursor, 'hola');
    expect(wrong.correct).toBe(false);
    expect(wrong.cursor.stepIndex).toBe(initial.cursor.stepIndex);
    expect(wrong.cursor.attempts).toBe(1);
    const yes = respondToQuestion(lesson, wrong.cursor, 'METÁL');
    expect(yes.correct).toBe(true);
    expect(yes.next?.teacherLines.join(' ')).toContain('five vowels');
    expect(yes.next?.question).toContain('he is normal');
  });
  it('rejects corrupt awaiting cursors rather than supplying undefined prompts', () => {
    expect(() => nextCue(lesson, { ...freshCursor(2), phase: 'awaiting_answer' }))
      .toThrow('corrupt awaiting-question cursor');
  });
  it('does not auto-advance open-ended reflective prompts', () => {
    const synthetic = { ...lesson, steps: [{ id: 'open', kind: 'question' as const,
      text: 'Explain why', expectedAnswers: [], required: true as const }] };
    const started = nextCue(synthetic, freshCursor(2));
    const reflection = respondToQuestion(synthetic, started.cursor, 'because');
    expect(reflection.correct).toBeNull();
    expect(reflection.cursor.phase).toBe('completed');
    expect(confirmOpenPrompt(synthetic, started.cursor).cursor.phase).toBe('completed');
  });
  it('contains canonical gap lesson 25 rather than skipping it', () => {
    const n = availableLessonNumbers();
    expect(n).toContain(2);
    expect(n).toContain(90);
    expect(n).not.toContain(25);
  });
});

describe('sequential unlocks', () => {
  it('locks lesson 3 until all required steps of lesson 2 finish', async () => {
    const store = new CourseStore();
    const rows = await store.overview('learner');
    expect(rows.find((x) => x.number === 2)?.status).toBe('available');
    expect(rows.find((x) => x.number === 3)?.status).toBe('locked');
    await expect(store.requireUnlocked('learner', 3)).rejects.toThrow('locked');
    const count = getAuthoredLesson(2).steps.length;
    await store.save('learner', { ...freshCursor(2), stepIndex: count - 1, phase: 'ready' });
    await expect(store.requireUnlocked('learner', 3)).rejects.toThrow('locked');
    await store.save('learner', { ...freshCursor(2), stepIndex: count, phase: 'completed' });
    expect((await store.overview('learner')).find((x) => x.number === 3)?.status).toBe('available');
  });
});
