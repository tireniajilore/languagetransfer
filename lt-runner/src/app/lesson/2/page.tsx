import { LessonPlayer } from '@/components/lesson-player';
import { lesson02 } from '@/data/lesson-02';

interface LessonTwoPageProps {
  searchParams?: {
    autostart?: string;
  };
}

export default function LessonTwoPage({ searchParams }: LessonTwoPageProps) {
  return <LessonPlayer lesson={lesson02} autostart={searchParams?.autostart === '1'} />;
}
