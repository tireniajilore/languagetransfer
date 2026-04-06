import rawLesson02 from '@/data/lesson-02.json';
import { convertRawLessonToLesson } from '@/lib/parse-transcript';
import type { Lesson, RawLesson } from '@/types/lesson';

export const lesson02: Lesson = convertRawLessonToLesson(rawLesson02 as RawLesson);
