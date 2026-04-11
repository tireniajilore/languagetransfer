import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { convertRawLessonToLesson } from '@/lib/parse-transcript';
import type { Lesson, RawLesson, SpeechSegment } from '@/types/lesson';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');

export function formatLessonNumber(lessonNumber: number) {
  return String(lessonNumber).padStart(2, '0');
}

function getRawLessonPath(lessonNumber: number) {
  return path.join(DATA_DIR, `lesson-${formatLessonNumber(lessonNumber)}.json`);
}

function getSegmentsPath(lessonNumber: number) {
  return path.join(DATA_DIR, `lesson-${formatLessonNumber(lessonNumber)}-segments.json`);
}

export function getAvailableLessons(): number[] {
  return readdirSync(DATA_DIR)
    .map((fileName) => {
      const match = fileName.match(/^lesson-(\d{2})\.json$/);
      return match ? Number(match[1]) : null;
    })
    .filter((lessonNumber): lessonNumber is number => lessonNumber !== null)
    .sort((a, b) => a - b);
}

export function getRawLesson(lessonNumber: number): RawLesson {
  const lessonPath = getRawLessonPath(lessonNumber);
  return JSON.parse(readFileSync(lessonPath, 'utf8')) as RawLesson;
}

export function getLessonSegments(lessonNumber: number): Record<string, SpeechSegment[]> {
  const segmentsPath = getSegmentsPath(lessonNumber);
  if (!existsSync(segmentsPath)) {
    return {};
  }

  return JSON.parse(readFileSync(segmentsPath, 'utf8')) as Record<string, SpeechSegment[]>;
}

export function getLesson(lessonNumber: number): Lesson {
  return convertRawLessonToLesson(
    getRawLesson(lessonNumber),
    getLessonSegments(lessonNumber)
  );
}
