import type { Lesson, LessonStep } from '@/types/lesson';
import { getLesson } from '@/data/get-lesson';

const CONDENSED_INTRO_STEP: LessonStep = {
  id: 'mihalis-intro',
  type: 'narration',
  text: 'English and Spanish share a lot of Latin vocabulary. Words ending in -al often transfer directly into Spanish. You keep the vowels clean and stress the final syllable.',
  estimatedDuration: 12
};

function isOutroStep(step: LessonStep) {
  return step.sourceKey?.startsWith('outro-') ?? false;
}

export function getMihalisPrototypeLesson(): Lesson {
  const lesson = getLesson(2);
  const firstPromptIndex = lesson.steps.findIndex((step) => step.type === 'prompt');
  const lessonBody = lesson.steps
    .slice(firstPromptIndex >= 0 ? firstPromptIndex : 0)
    .filter((step) => !isOutroStep(step));

  return {
    ...lesson,
    id: 'mihalis-lesson-02',
    description: 'Voice-only Lesson 2 prototype',
    steps: [CONDENSED_INTRO_STEP, ...lessonBody]
  };
}
