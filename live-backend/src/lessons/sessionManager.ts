/**
 * Lesson-specific session instances; one voice session owns exactly one lesson.
 * The same shared conductor is configured using the current authored lesson.
 */
import { CourseStore } from './courseStore';
import { freshCursor, getAuthoredLesson, nextCue, respondToQuestion,
  type LessonCue, type LessonCursor } from './conductor';

interface Instance {
  learnerId: string;
  number: number;
  cursor: LessonCursor;
  started: boolean;
  busy: boolean;
}
export class LessonSessionManager {
  private readonly sessions = new Map<string, Instance>();
  constructor(private readonly course: CourseStore) {}

  async prepare(sessionId: string, learnerId: string, number: number): Promise<void> {
    const cursor = await this.course.requireUnlocked(learnerId, number);
    this.sessions.set(sessionId, {
      learnerId, number, cursor: cursor ?? freshCursor(number), started: false, busy: false,
    });
  }

  has(sessionId: string): boolean { return this.sessions.has(sessionId); }
  get(sessionId: string): { number: number; cursor: LessonCursor; started: boolean } | null {
    const s = this.sessions.get(sessionId);
    return s ? { number: s.number, cursor: { ...s.cursor }, started: s.started } : null;
  }

  async start(sessionId: string): Promise<LessonCue | null> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('unknown lesson session');
    if (session.started) return null;
    const next = nextCue(getAuthoredLesson(session.number), session.cursor);
    await this.course.save(session.learnerId, next.cursor);
    session.cursor = next.cursor;
    session.started = true;
    return next.cue;
  }

  async hear(sessionId: string, transcript: string): Promise<{
    accepted: boolean; correct: boolean | null; cue: LessonCue | null; cursor: LessonCursor;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.started || session.busy) return null;
    session.busy = true;
    try {
      const outcome = respondToQuestion(getAuthoredLesson(session.number), session.cursor, transcript);
      if (outcome.cursor.updatedAt !== session.cursor.updatedAt ||
          outcome.cursor.stepIndex !== session.cursor.stepIndex ||
          outcome.cursor.attempts !== session.cursor.attempts) {
        await this.course.save(session.learnerId, outcome.cursor);
        session.cursor = outcome.cursor;
      }
      return { accepted: outcome.accepted, correct: outcome.correct,
        cue: outcome.next, cursor: { ...session.cursor } };
    } finally {
      session.busy = false;
    }
  }

  currentQuestion(sessionId: string): string | null {
    const active = this.sessions.get(sessionId);
    if (!active || active.cursor.phase !== 'awaiting_answer') return null;
    const step = getAuthoredLesson(active.number).steps[active.cursor.stepIndex - 1];
    return step?.kind === 'question' ? step.text : null;
  }

  forgetSession(sessionId: string): void { this.sessions.delete(sessionId); }
  get courseStore(): CourseStore { return this.course; }
}

/** Bind one GPT-Live instance to the original authored lesson, not a topic. */
export function lessonInstructions(number: number, originalStyle: string): string {
  const lesson = getAuthoredLesson(number);
  return [
    `You are teaching Language Transfer Complete Spanish LESSON ${number}: ${lesson.title}.`,
    'The original lesson is the source of truth. Its ordered questions, discovery logic, examples, and explanations are mandatory.',
    'You are NOT a general Spanish tutor. Never ask what the learner would like to study.',
    'Wait for the application START cue containing the authored lesson passage. Do not initiate a question, example, greeting, or subject without a cue.',
    'On receipt of a lesson commentary append, conversationally deliver its actual authored content, preserving the order.',
    'Never SUBSTITUTE your own example or skip a required passage to improvise.',
    'Ask precisely the next authorized question and wait for the learner; do not give its answer prematurely.',
    'Do not say that an answer is correct or congratulate a specific answer until the backend has authorized progression. Do not treat unrelated Spanish words as correct just because they sound plausible.',
    'Offer patient hints and clarifications to actual learner replies; do not jump to future material.',
    'Short detours are permitted, but return to the currently authorized question, not a new topic.',
    'The backend decides when a question is completed. Never claim to have completed a lesson before it says so.',
    'Use English for explanations and Spanish only where the original material introduces it.',
    originalStyle,
  ].join(' ');
}

/** Behavioral constraints only: the student-facing authored lesson text goes
 * via session.commentary.append, never as instructions or private answers. */
export function cueInstructions(cue: LessonCue): string {
  if (cue.complete) return 'The authored lesson is now complete. Congratulate the learner and do not introduce another lesson.';
  return [
    `You are now teaching the AUTHORIZED Lesson ${cue.lessonNumber} passage at step ${cue.stepIndex}.`,
    'The incoming commentary contains the ORIGINAL teaching text, not optional suggestions.',
    'Preserve every essential explanation and its examples in order, using natural conversational phrasing.',
    'Do NOT substitute other words, examples or questions. Do NOT summarize away an explanation.',
    cue.question
      ? 'Finish by asking exactly the supplied lesson question and WAIT for the learner. Answer it only after the student has worked it out.'
      : 'Finish the authorized passage and pause. Do not invent a new question.',
    'The conductor alone determines progression. This instruction supersedes previous passage guidance.',
  ].join(' ');
}
