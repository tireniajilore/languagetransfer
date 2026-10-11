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

  forgetSession(sessionId: string): void { this.sessions.delete(sessionId); }
  get courseStore(): CourseStore { return this.course; }
}

/** Unlike generic teaching instructions, these bind Live to a specific lesson. */
export function lessonInstructions(number: number, originalStyle: string): string {
  const lesson = getAuthoredLesson(number);
  return [
    originalStyle,
    `You are the dedicated teacher of Language Transfer COMPLETE SPANISH LESSON ${number}: ${lesson.title}.`,
    'You are NOT a general Spanish tutor. Never ask what the learner would like to study.',
    'The backend conductor owns the canonical order of explanations, questions, and discoveries.',
    'Your job is to express each authorized step conversationally, not quote it mechanically.',
    'Wait for the application START cue. Do not greet, initiate a topic, or speak beforehand.',
    'Within each step, respond to the learner, give helpful hints, repeat or clarify when needed.',
    'Never introduce the next question or teaching point until the application provides it.',
    'A learner can interrupt with clarification; answer briefly and return to the awaiting question.',
    'The backend, not you, determines when to advance and unlock another lesson.',
    'Use English as the main instruction language with Spanish examples introduced by this lesson.',
    'Do not manufacture future concepts or choose a new syllabus.',
  ].join(' ');
}

export function cueInstructions(cue: LessonCue): string {
  if (cue.complete) return 'The learner has completed all required steps of this lesson. Warmly congratulate them, then stop; do not teach the next lesson.';
  const lines = [
    `AUTHORIZED LESSON ${cue.lessonNumber} STEP ${cue.stepIndex} (supersedes previous step instructions).`,
    'This is the complete next lesson segment. Cover its important ideas in order, in your own natural words.',
    ...cue.teacherLines.map((line, i) => `Explanation ${i + 1}: ${line}`),
  ];
  if (cue.question) {
    lines.push(`Required next question, paraphrase permitted but meaning unchanged: ${cue.question}`);
    lines.push('Ask this question, then WAIT for the learner; do not reveal its answer or ask later questions.');
    if (cue.expectedAnswers?.length) {
      lines.push('Private assessment targets (never read these aloud): ' + cue.expectedAnswers.join(' | '));
    } else {
      lines.push('This is an open reflection, not a right-or-wrong answer. Wait for learner participation.');
    }
  }
  return lines.join('\n');
}
