import { describe, expect, it } from 'vitest';
import { freshCursor, getAuthoredLesson, nextCue, respondToQuestion } from '../conductor';
import { deliverLessonCue, deliverRetry } from '../liveCommands';

function messages() {
  const events: Record<string, unknown>[] = [];
  return { events, sender: { sendCommand(event: Record<string, unknown>) { events.push(event); } } };
}

describe('canonical Language Transfer speech cues', () => {
  it('speaks the original Lesson 2 introduction and metal question, not an invented international question', () => {
    const lesson = getAuthoredLesson(2);
    const first = nextCue(lesson, freshCursor(2));
    const { events, sender } = messages();
    deliverLessonCue(sender, first.cue);
    const instructions = events.filter((e) => e.type === 'session.instructions.append');
    const commentary = events.filter((e) => e.type === 'session.commentary.append');
    expect(instructions).toHaveLength(1);
    expect(commentary.length).toBeGreaterThan(0);
    expect(commentary.map((e) => e.content).join(' ')).toContain('English and Spanish');
    expect(commentary.map((e) => e.content).join(' ')).toContain('How would you say metal?');
    expect(commentary.map((e) => e.content).join(' ')).not.toContain('international');
    for (const event of events) {
      expect(event).toMatchObject({
        delegation_id: null,
        content: expect.any(String),
        event_id: expect.any(String),
      });
      expect(String(event.content).length).toBeLessThan(1000);
      expect(event).not.toHaveProperty('instructions');
    }
    expect(events.some((e) => e.type === 'response.create')).toBe(false);
  });

  it('replays necessary original explanations when a question was sent but never answered', () => {
    const lesson = getAuthoredLesson(2);
    const first = nextCue(lesson, freshCursor(2));
    const resumed = nextCue(lesson, first.cursor);
    expect(resumed.cursor).toEqual(first.cursor);
    expect(resumed.cue.teacherLines).toEqual(first.cue.teacherLines);
    expect(resumed.cue.question).toBe(first.cue.question);
  });

  it('acknowledgements cannot advance or halt the canonical lesson; retry repeats the same question', () => {
    const lesson = getAuthoredLesson(2);
    const initial = nextCue(lesson, freshCursor(2));
    const acknowledge = respondToQuestion(lesson, initial.cursor, 'Okay');
    expect(acknowledge.correct).toBe(false);
    expect(acknowledge.cursor).toEqual(initial.cursor);
    expect(acknowledge.next).toBeNull();
    const { events, sender } = messages();
    deliverRetry(sender, initial.cue.question!, acknowledge.cursor.attempts);
    expect(events.at(-1)?.content).toContain('How would you say metal?');
    expect(events.at(-1)?.content).not.toContain('international');
  });

  it('accepts natural hedging but not a longer contradictory sentence', () => {
    const lesson = getAuthoredLesson(2);
    const first = nextCue(lesson, freshCursor(2));
    expect(respondToQuestion(lesson, first.cursor, 'I think metal').correct).toBe(true);
    const next = respondToQuestion(lesson, first.cursor, 'metal').next!;
    expect(next.expectedAnswers).toContain('es normal');
    expect(respondToQuestion(lesson, nextCue(lesson, {
      ...first.cursor, stepIndex: next.stepIndex + 1, phase: 'awaiting_answer',
    }).cursor, 'no es normal').correct).toBe(false);
  });

  it('does not reveal the answer to the next required question when a learner makes a mistake', () => {
    const lesson = getAuthoredLesson(2);
    const first = nextCue(lesson, freshCursor(2));
    const wrong = respondToQuestion(lesson, first.cursor, 'internacional');
    expect(wrong.correct).toBe(false);
    expect(wrong.next).toBeNull();
    expect(wrong.cursor.stepIndex).toBe(first.cursor.stepIndex);
    const { events, sender } = messages();
    deliverRetry(sender, first.cue.question!, wrong.cursor.attempts);
    expect(events.every((e) => !String(e.content).includes('es normal'))).toBe(true);
  });
});
