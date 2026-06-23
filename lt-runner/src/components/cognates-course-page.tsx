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
  const nextLesson = summary.lessons.find((lesson) => lesson.id === nextLessonId) ?? summary.lessons[0];
  const totalLessons = summary.lessons.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const nextLessonProgress = nextLesson ? progress?.lessons[nextLesson.id] : undefined;
  const nextActionLabel = completedCount === totalLessons
    ? 'Review course'
    : nextLessonProgress?.startedAt
      ? 'Resume lesson'
      : 'Start lesson';

  return (
    <main className="min-h-screen max-w-full overflow-hidden bg-[var(--paper)] px-4 pb-12 pt-5 text-[var(--ink)] md:px-6 md:pt-7">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col gap-9">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--rule)] pb-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--ink-3)]">
              Cognates
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ink-2)] [overflow-wrap:anywhere]">
              Five lesson speaking path
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-[var(--ink)]">
              {completedCount} / {totalLessons}
            </p>
            <p className="text-sm font-semibold text-[var(--ink-3)]">
              complete
            </p>
          </div>
        </header>

        <section className="grid gap-7 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] md:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--accent)]">
              Spanish starter
            </p>
            <h1 className="mt-3 max-w-full font-display text-[2.35rem] leading-[1.02] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[2.75rem] md:max-w-3xl md:text-6xl">
              {summary.title}
            </h1>
            <p className="mt-5 max-w-full text-base leading-7 text-[var(--ink-2)] [overflow-wrap:anywhere] md:max-w-2xl md:text-lg">
              {summary.description}
            </p>
          </div>

          {nextLesson ? (
            <div className="min-w-0 border-t border-[var(--rule)] pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0">
              <p className="text-sm font-semibold text-[var(--ink-3)]">
                Up next
              </p>
              <h2 className="mt-3 max-w-full font-display text-[1.85rem] leading-tight text-[var(--ink)] [overflow-wrap:anywhere] sm:text-3xl">
                {nextLesson.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-2)] [overflow-wrap:anywhere]">
                {nextLesson.sectionCount} sections · {nextLesson.promptCount} prompts · {nextLesson.estimatedMinutes} min
              </p>
              <Link
                href={`/cognates/${nextLesson.id}`}
                className="mt-5 inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                {nextActionLabel}
              </Link>
            </div>
          ) : null}
        </section>

        <section aria-label="Course progress" className="grid min-w-0 gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)] [overflow-wrap:anywhere]">
            Progress saves in this browser. Pick any lesson, or follow the suggested next step.
          </p>
        </section>

        <section className="border-y border-[var(--rule)]">
          {summary.lessons.map((lesson) => {
            const lessonProgress = progress?.lessons[lesson.id];
            const isCompleted = Boolean(lessonProgress?.completedAt);
            const isStarted = Boolean(lessonProgress?.startedAt);
            const href = `/cognates/${lesson.id}`;
            const cta = isCompleted ? 'Review' : isStarted ? 'Resume' : lesson.id === nextLessonId ? 'Start' : 'Open';
            const status = isCompleted ? 'completed' : isStarted ? 'in progress' : 'not started';

            return (
              <article
                key={lesson.id}
                className={`group grid min-w-0 gap-4 border-b border-[var(--rule)] py-5 pl-4 transition-colors last:border-b-0 hover:bg-[var(--paper-2)] md:grid-cols-[3.5rem_minmax(0,1fr)_auto] md:items-center md:pr-4 ${
                  lesson.id === nextLessonId ? 'border-l-2 border-l-[var(--accent)]' : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--paper)] text-sm font-semibold text-[var(--ink-2)] md:h-11 md:w-11">
                  {String(lesson.number).padStart(2, '0')}
                </div>

                <div className="min-w-0">
                  <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
                    <h2 className="max-w-full font-display text-2xl leading-tight text-[var(--ink)] [overflow-wrap:anywhere]">
                      {lesson.title}
                    </h2>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                      isCompleted
                        ? 'bg-[color-mix(in_oklch,var(--success)_14%,transparent)] text-[var(--success)]'
                        : lesson.id === nextLessonId
                          ? 'bg-[color-mix(in_oklch,var(--accent)_14%,transparent)] text-[var(--accent)]'
                          : 'bg-[var(--paper-3)] text-[var(--ink-3)]'
                    }`}>
                      {status}
                    </span>
                  </div>
                  <p className="mt-2 max-w-full text-sm leading-6 text-[var(--ink-2)] [overflow-wrap:anywhere] md:max-w-2xl">
                    {lesson.promise}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[var(--ink-3)] [overflow-wrap:anywhere]">
                    {lesson.sectionCount} sections · {lesson.promptCount} prompts · {lesson.estimatedMinutes} min
                  </p>
                </div>

                <div className="flex md:justify-end">
                  <Link
                    href={href}
                    aria-label={`${cta} ${lesson.title}`}
                    className={`inline-flex min-h-10 min-w-24 items-center justify-center whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${
                      lesson.id === nextLessonId
                        ? 'bg-[var(--accent)] text-[var(--accent-ink)] group-hover:bg-[var(--accent-2)]'
                        : 'border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-2)] group-hover:border-[var(--ink-3)] group-hover:text-[var(--ink)]'
                    }`}
                  >
                    {cta}
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
