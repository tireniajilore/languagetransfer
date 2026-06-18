'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { COGNATES_COURSE_VERSION } from '@/data/cognates/course';
import { countCompletedLessons, getNextLessonId, loadCognatesProgress } from '@/lib/cognates-progress';
import { trackEventOnce } from '@/lib/analytics';
import type { CognatesCourseSummary } from '@/data/cognates/adapter';
import type { CognatesProgress } from '@/lib/cognates-progress';

interface CognatesCoursePageProps {
  summary: CognatesCourseSummary;
}

export function CognatesCoursePage({ summary }: CognatesCoursePageProps) {
  const [progress, setProgress] = useState<CognatesProgress | null>(null);

  useEffect(() => {
    setProgress(loadCognatesProgress());
    trackEventOnce('cognates-course-viewed', 'cognates_course_viewed', {
      courseId: summary.id,
      courseVersion: COGNATES_COURSE_VERSION,
      lessonCount: summary.lessons.length
    });
  }, [summary.id, summary.lessons.length]);

  const completedCount = progress ? countCompletedLessons(progress) : 0;
  const lessonIds = useMemo(() => summary.lessons.map((lesson) => lesson.id), [summary.lessons]);
  const nextLessonId = progress ? getNextLessonId(progress, lessonIds) : lessonIds[0];

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="rounded-[2rem] bg-white/80 p-6 shadow-panel backdrop-blur md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ink/45">
            Five lesson speaking path
          </p>
          <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                {summary.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-ink/65">
                {summary.description}
              </p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-white px-5 py-4 text-sm text-ink/65">
              <p className="font-semibold text-ink">{completedCount} / {summary.lessons.length} complete</p>
              <p>Progress saves in this browser.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4">
          {summary.lessons.map((lesson) => {
            const lessonProgress = progress?.lessons[lesson.id];
            const isCompleted = Boolean(lessonProgress?.completedAt);
            const isStarted = Boolean(lessonProgress?.startedAt);
            const href = `/cognates/${lesson.id}`;
            const cta = isCompleted ? 'Review' : isStarted ? 'Resume' : lesson.id === nextLessonId ? 'Start' : 'Open';

            return (
              <Link
                key={lesson.id}
                href={href}
                className="group rounded-[1.5rem] border border-ink/10 bg-white/80 p-5 shadow-panel backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${
                      isCompleted ? 'bg-leaf text-white' : lesson.id === nextLessonId ? 'bg-coral text-white' : 'bg-mist text-ink'
                    }`}>
                      {lesson.number}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold tracking-tight text-ink">{lesson.title}</h2>
                        <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold text-ink/55">
                          {isCompleted ? 'completed' : isStarted ? 'in progress' : 'not started'}
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">{lesson.promise}</p>
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-ink/40">
                        {lesson.sectionCount} sections · {lesson.promptCount} prompts · {lesson.estimatedMinutes} min
                      </p>
                    </div>
                  </div>
                  <div className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-leaf md:min-w-28">
                    {cta}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
