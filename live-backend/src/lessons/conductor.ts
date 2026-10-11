/**
 * Canonical Language Transfer sequence. The teacher may paraphrase or assist,
 * but only this conductor controls the authored order and lesson completion.
 * Raw lesson data is mirrored directly from lt-runner/src/data/lesson-XX.json.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface LessonTurn {
  id: string;
  kind: 'explanation' | 'question';
  text: string;
  expectedAnswers: string[];
  required: true;
}
export interface AuthoredLesson {
  number: number;
  title: string;
  description: string;
  version: string;
  steps: LessonTurn[];
}
export type LessonPhase = 'ready' | 'awaiting_answer' | 'completed';
export interface LessonCursor {
  lessonNumber: number;
  stepIndex: number;
  phase: LessonPhase;
  attempts: number;
  updatedAt: number;
}
export interface LessonCue {
  lessonNumber: number;
  stepIndex: number;
  phase: LessonPhase;
  teacherLines: string[];
  question?: string;
  expectedAnswers?: string[];
  complete: boolean;
}
export interface AnswerOutcome {
  accepted: boolean;
  correct: boolean | null;
  cursor: LessonCursor;
  next: LessonCue | null;
}

const paths = [
  join(process.cwd(), 'src', 'lessons', 'data'),
  join(__dirname, 'data'),
  join(__dirname, '..', '..', 'src', 'lessons', 'data'),
];
function sourceDir(): string {
  const dir = paths.find(existsSync);
  if (!dir) throw new Error('canonical lesson data missing from live-backend deployment');
  return dir;
}
export function availableLessonNumbers(): number[] {
  return readdirSync(sourceDir())
    .flatMap((x) => {
      const m = /^lesson-(\d{2})\.json$/.exec(x);
      return m ? [Number(m[1])] : [];
    }).sort((a, b) => a - b);
}
const lessonCache = new Map<number, AuthoredLesson>();
export function getAuthoredLesson(number: number): AuthoredLesson {
  if (!Number.isInteger(number) || number < 2 || number > 90) throw new Error('invalid lesson number');
  const cached = lessonCache.get(number);
  if (cached) return cached;
  const p = join(sourceDir(), `lesson-${String(number).padStart(2, '0')}.json`);
  if (!existsSync(p)) throw new Error(`Lesson ${number} is not available in the source material`);
  const raw = JSON.parse(readFileSync(p, 'utf8')) as {
    title: string; description: string;
    turns: Array<{ speaker: string; text?: string; is_prompt?: boolean; expected_answers?: string[] }>;
    outro?: Array<{ type: string; text?: string }>;
  };
  const steps: LessonTurn[] = [];
  for (let i = 0; i < raw.turns.length; i++) {
    const t = raw.turns[i];
    if (t.speaker !== 'tutor' || !t.text?.trim()) continue;
    const next = raw.turns[i + 1];
    const answers = t.is_prompt && next?.speaker === 'student' ? next.expected_answers ?? [] : [];
    steps.push({
      id: `${number}-turn-${i}`,
      kind: t.is_prompt ? 'question' : 'explanation',
      text: t.text.trim(),
      expectedAnswers: [...answers],
      required: true,
    });
  }
  for (const [i, outro] of (raw.outro ?? []).entries()) {
    if (!outro.text?.trim()) continue;
    steps.push({
      id: `${number}-outro-${i}`,
      kind: outro.type === 'open_prompt' ? 'question' : 'explanation',
      text: outro.text.trim(),
      expectedAnswers: [],
      required: true,
    });
  }
  if (!steps.length) throw new Error(`Lesson ${number} has no teaching steps`);
  const lesson = { number, title: raw.title, description: raw.description,
    version: `original-lesson-${number}-v1`, steps };
  lessonCache.set(number, lesson);
  return lesson;
}

export function freshCursor(lessonNumber: number): LessonCursor {
  return { lessonNumber, stepIndex: 0, phase: 'ready', attempts: 0, updatedAt: Date.now() };
}
export function normalizeAnswer(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Authorize the next authored passage, stopping at the next learner question. */
export function nextCue(lesson: AuthoredLesson, cursor: LessonCursor): {
  cursor: LessonCursor; cue: LessonCue;
} {
  if (cursor.lessonNumber !== lesson.number) throw new Error('cursor does not belong to lesson');
  if (cursor.phase === 'awaiting_answer') {
    const q = lesson.steps[cursor.stepIndex - 1];
    return { cursor, cue: { lessonNumber: lesson.number, stepIndex: cursor.stepIndex - 1,
      phase: cursor.phase, teacherLines: [], question: q?.text, expectedAnswers: q?.expectedAnswers,
      complete: false } };
  }
  if (cursor.phase === 'completed') return { cursor, cue: {
    lessonNumber: lesson.number, stepIndex: cursor.stepIndex, phase: 'completed',
    teacherLines: [], complete: true,
  } };
  let i = cursor.stepIndex;
  const teacherLines: string[] = [];
  let question: string | undefined;
  let answers: string[] | undefined;
  while (i < lesson.steps.length) {
    const step = lesson.steps[i++];
    if (step.kind === 'question') {
      question = step.text;
      answers = step.expectedAnswers;
      break;
    }
    teacherLines.push(step.text);
  }
  const phase: LessonPhase = question ? 'awaiting_answer' : 'completed';
  const next = { ...cursor, stepIndex: i, phase, attempts: 0, updatedAt: Date.now() };
  return { cursor: next, cue: {
    lessonNumber: lesson.number, stepIndex: i - 1, phase,
    teacherLines, ...(question ? { question, expectedAnswers: answers } : {}),
    complete: phase === 'completed',
  } };
}

/** Never move past an unanswered or incorrect required question. */
export function respondToQuestion(lesson: AuthoredLesson, cursor: LessonCursor, utterance: string): AnswerOutcome {
  if (cursor.lessonNumber !== lesson.number || cursor.phase !== 'awaiting_answer') {
    return { accepted: false, correct: null, cursor, next: null };
  }
  const q = lesson.steps[cursor.stepIndex - 1];
  if (!q || q.kind !== 'question') throw new Error('corrupt lesson cursor');
  const heard = normalizeAnswer(utterance);
  if (!heard) return { accepted: false, correct: null, cursor, next: null };
  const known = q.expectedAnswers;
  // An open reflection has no objectively correct string. Participating by
  // speaking completes the prompt, but does NOT count as mastery evidence.
  if (!known.length) {
    const next = nextCue(lesson, { ...cursor, phase: 'ready', attempts: 0, updatedAt: Date.now() });
    return { accepted: true, correct: null, cursor: next.cursor, next: next.cue };
  }
  const correct = known.some((a) => normalizeAnswer(a) === heard);
  if (!correct) return { accepted: true, correct: false, cursor: {
    ...cursor, attempts: cursor.attempts + 1, updatedAt: Date.now(),
  }, next: null };
  const passed = { ...cursor, phase: 'ready' as const, attempts: 0, updatedAt: Date.now() };
  const next = nextCue(lesson, passed);
  return { accepted: true, correct: true, cursor: next.cursor, next: next.cue };
}

/** Used for open prompts: must be invoked by an authorized assessment, not a text matcher. */
export function confirmOpenPrompt(lesson: AuthoredLesson, cursor: LessonCursor): {cursor: LessonCursor; cue: LessonCue} {
  if (cursor.phase !== 'awaiting_answer' ||
    lesson.steps[cursor.stepIndex - 1]?.expectedAnswers.length !== 0) {
    throw new Error('only open prompts can be confirmed');
  }
  return nextCue(lesson, { ...cursor, phase: 'ready', attempts: 0, updatedAt: Date.now() });
}
