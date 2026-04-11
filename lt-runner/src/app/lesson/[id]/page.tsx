import { notFound } from 'next/navigation';
import { LessonPlayer } from '@/components/lesson-player';
import { getAvailableLessons, getLesson } from '@/data/get-lesson';

interface LessonPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    autostart?: string;
  };
}

export function generateStaticParams() {
  return getAvailableLessons().map((lessonNumber) => ({
    id: String(lessonNumber)
  }));
}

export default function LessonPage({ params, searchParams }: LessonPageProps) {
  const lessonNumber = Number(params.id);

  if (!Number.isInteger(lessonNumber)) {
    notFound();
  }

  const availableLessons = new Set(getAvailableLessons());
  if (!availableLessons.has(lessonNumber)) {
    notFound();
  }

  return (
    <LessonPlayer
      lesson={getLesson(lessonNumber)}
      autostart={searchParams?.autostart === '1'}
    />
  );
}
