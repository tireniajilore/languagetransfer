'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CourseLesson {
  number: number;
  title: string;
  status: 'available' | 'in_progress' | 'completed' | 'locked' | 'missing';
  stepIndex: number;
  totalSteps: number;
}
const learnerKey = 'lt-live-learner-v1';

export default function LiveCoursePage() {
  const backendUrl = process.env.NEXT_PUBLIC_LIVE_BACKEND_URL ?? '';
  const enabled = process.env.NEXT_PUBLIC_LIVE_TUTOR_ENABLED === '1';
  const [lessons, setLessons] = useState<CourseLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !backendUrl) { setLoading(false); return; }
    const controller = new AbortController();
    async function load() {
      try {
        let token = '';
        try { token = localStorage.getItem(learnerKey) ?? ''; } catch { /* private browsing */ }
        const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/live/course`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Unable to load course (HTTP ${res.status}).`);
        const data = await res.json() as { learnerToken: string; lessons: CourseLesson[] };
        try { localStorage.setItem(learnerKey, data.learnerToken); } catch { /* private browsing */ }
        setLessons(data.lessons);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [backendUrl, enabled]);

  if (!enabled) return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10">
      <h1 className="font-display text-3xl font-semibold">Complete Spanish</h1>
      <p>The live course is disabled in this environment.</p>
      <Link className="underline" href="/">Use the scripted lessons</Link>
    </main>
  );

  function renderLesson(lesson: CourseLesson) {
    const open = lesson.status === 'available' || lesson.status === 'in_progress' || lesson.status === 'completed';
    return (
      <li key={lesson.number} className={`rounded-xl border p-4 ${open ? 'border-stone-300 bg-white' : 'border-stone-200 bg-stone-50 opacity-70'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-stone-700">Lesson {lesson.number}</span>
            <h2 className="mt-1 text-lg font-medium">{lesson.title}</h2>
          </div>
          <span className="shrink-0 rounded-full bg-stone-200 px-2 py-1 text-xs capitalize text-stone-700">{lesson.status.replace('_', ' ')}</span>
        </div>
        {lesson.stepIndex > 0 && (
          <p className="mt-2 text-xs text-stone-500">{lesson.stepIndex} / {lesson.totalSteps} steps</p>
        )}
        {open && (
          <Link href={`/live/${lesson.number}`}
            className="mt-3 inline-flex rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
            {lesson.status === 'completed' ? 'Review lesson' : lesson.status === 'in_progress' ? 'Resume lesson' : 'Start lesson'}
          </Link>
        )}
        {lesson.status === 'missing' && <p className="mt-2 text-xs text-amber-800">Original lesson source unavailable; following lessons remain locked.</p>}
      </li>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">Complete Spanish</h1>
        <p className="text-stone-600">The original Language Transfer lessons, taught conversationally. Start at Lesson 2 and finish each lesson to unlock the next.</p>
        <Link href="/" className="text-sm text-stone-500 underline">Original scripted player</Link>
      </header>
      {!backendUrl && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Set NEXT_PUBLIC_LIVE_BACKEND_URL to enable the live course.</p>}
      {loading && <p className="text-sm text-stone-500">Loading your lessons…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {lessons.length > 0 && (
        <>
          <ol className="space-y-3">{lessons.slice(0, 8).map(renderLesson)}</ol>
          {lessons.length > 8 && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-700">Show remaining {lessons.length - 8} lessons</summary>
              <ol className="mt-3 space-y-3">{lessons.slice(8).map(renderLesson)}</ol>
            </details>
          )}
        </>
      )}
    </main>
  );
}
