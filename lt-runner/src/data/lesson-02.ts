import rawLesson02 from '../../../data/lessons_v2/lesson_02.json';
import { convertRawLessonToLesson } from '@/lib/parse-transcript';
import type { Lesson, RawLesson } from '@/types/lesson';

export const lesson02: Lesson = convertRawLessonToLesson(rawLesson02 as RawLesson);
