import { notFound } from 'next/navigation';
import { CognatesLessonPlayer } from '@/components/cognates-lesson-player';
import { getCognatesLessonBundle, getCognatesLessonIds } from '@/data/cognates/adapter';

interface CognatesLessonPageProps {
  params: {
    lessonId: string;
  };
}

export function generateStaticParams() {
  return getCognatesLessonIds().map((lessonId) => ({ lessonId }));
}

export default function CognatesLessonPage({ params }: CognatesLessonPageProps) {
  const bundle = getCognatesLessonBundle(params.lessonId);

  if (!bundle) {
    notFound();
  }

  return <CognatesLessonPlayer bundle={bundle} />;
}
