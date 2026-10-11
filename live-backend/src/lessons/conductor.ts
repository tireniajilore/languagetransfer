/**
 * Legacy authored content loader. The reviewed teaching specification is the
 * live curriculum; supervisedConductor.ts is the sole progression authority.
 * Raw lesson data stays mirrored from lt-runner/src/data/lesson-XX.json.
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
const paths = [
  join(process.cwd(), 'src', 'lessons', 'data'),
  join(__dirname, 'data'),
  join(__dirname, '..', '..', 'src', 'lessons', 'data'),
];
function sourceDir(): string {
  const dir = paths.find(existsSync);
  if (!dir)
    throw new Error(
      'canonical lesson data missing from live-backend deployment',
    );
  return dir;
}
export function availableLessonNumbers(): number[] {
  return readdirSync(sourceDir())
    .flatMap((x) => {
      const m = /^lesson-(\d{2})\.json$/.exec(x);
      return m ? [Number(m[1])] : [];
    })
    .sort((a, b) => a - b);
}
const lessonCache = new Map<number, AuthoredLesson>();
export function getAuthoredLesson(number: number): AuthoredLesson {
  if (!Number.isInteger(number) || number < 2 || number > 90)
    throw new Error('invalid lesson number');
  const cached = lessonCache.get(number);
  if (cached) return cached;
  const p = join(sourceDir(), `lesson-${String(number).padStart(2, '0')}.json`);
  if (!existsSync(p))
    throw new Error(`Lesson ${number} is not available in the source material`);
  const raw = JSON.parse(readFileSync(p, 'utf8')) as {
    title: string;
    description: string;
    turns: Array<{
      speaker: string;
      text?: string;
      is_prompt?: boolean;
      expected_answers?: string[];
    }>;
    outro?: Array<{ type: string; text?: string }>;
  };
  if (
    typeof raw.title !== 'string' ||
    typeof raw.description !== 'string' ||
    !Array.isArray(raw.turns) ||
    !raw.turns.every(
      (turn) =>
        turn &&
        typeof turn === 'object' &&
        typeof turn.speaker === 'string' &&
        (turn.text === undefined || typeof turn.text === 'string') &&
        (turn.expected_answers === undefined ||
          (Array.isArray(turn.expected_answers) &&
            turn.expected_answers.every((v) => typeof v === 'string'))),
    )
  ) {
    throw new Error(`Lesson ${number} contains invalid authored data`);
  }
  if (raw.outro !== undefined && !Array.isArray(raw.outro)) {
    throw new Error(`Lesson ${number} contains invalid outro data`);
  }
  const steps: LessonTurn[] = [];
  for (let i = 0; i < raw.turns.length; i++) {
    const t = raw.turns[i];
    if (t.speaker !== 'tutor' || !t.text?.trim()) continue;
    const next = raw.turns[i + 1];
    const answers =
      t.is_prompt && next?.speaker === 'student'
        ? (next.expected_answers ?? [])
        : [];
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
  const lesson = {
    number,
    title: raw.title,
    description: raw.description,
    version: `original-lesson-${number}-v1`,
    steps,
  };
  lessonCache.set(number, lesson);
  return lesson;
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
