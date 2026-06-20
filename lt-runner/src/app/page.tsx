import { CognatesCoursePage } from '@/components/cognates-course-page';
import { getCognatesCourseSummary } from '@/data/cognates/adapter';

export default function HomePage() {
  return <CognatesCoursePage summary={getCognatesCourseSummary()} />;
}
