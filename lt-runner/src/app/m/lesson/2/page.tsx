import type { Metadata } from 'next';
import { MihalisPrototypePlayer } from '@/components/mihalis-prototype-player';
import { getMihalisPrototypeLesson } from '@/data/mihalis-prototype-lesson';

export const metadata: Metadata = {
  title: 'Lesson 2 Prototype',
  description: 'Private voice-only Lesson 2 prototype',
  robots: {
    index: false,
    follow: false
  }
};

export default function MihalisLessonPage() {
  return <MihalisPrototypePlayer lesson={getMihalisPrototypeLesson()} />;
}
