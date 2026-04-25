import type { Lesson } from '@/types/lesson';
import { getLesson } from '@/data/get-lesson';

export function getMihalisPrototypeLesson(): Lesson {
  return getLesson(2);
}
