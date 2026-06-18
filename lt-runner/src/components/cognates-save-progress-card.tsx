'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { getClientSessionContext } from '@/lib/session';
import type { CognatesProgress } from '@/lib/cognates-progress';

interface CognatesSaveProgressCardProps {
  courseLessonId: string;
  completedLessons: number;
  totalLessons: number;
  progress: CognatesProgress | null;
  onSaved: (email: string) => void;
}

export function CognatesSaveProgressCard({
  courseLessonId,
  completedLessons,
  totalLessons,
  progress,
  onSaved
}: CognatesSaveProgressCardProps) {
  const [email, setEmail] = useState(progress?.savedEmail ?? '');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    progress?.savedEmail ? 'success' : 'idle'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && status !== 'submitting';
  }, [email, status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const context = getClientSessionContext();
    if (!context) {
      setStatus('error');
      setErrorMessage('Unable to create a browser session.');
      return;
    }

    setStatus('submitting');
    setErrorMessage(null);

    const response = await fetch('/api/demand', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: context.sessionId,
        lessonId: courseLessonId,
        completedLesson: true,
        completionPercent: Math.round((completedLessons / totalLessons) * 100),
        wantsNextLesson: 'yes',
        email: email.trim(),
        rating: 5,
        feedbackText: `cognates_save_progress completed=${completedLessons}/${totalLessons}`,
        keepGoingReason: 'actually_learning',
        referrer: context.referrer,
        utmSource: context.utmSource,
        utmMedium: context.utmMedium,
        utmCampaign: context.utmCampaign,
        honeypot
      })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setStatus('error');
      setErrorMessage(body?.error ?? 'Unable to save your email right now.');
      return;
    }

    onSaved(email.trim());
    await trackEvent('cognates_save_progress_submitted', {
      lessonId: courseLessonId,
      completedLessons,
      totalLessons,
      emailCaptured: true
    });
    setStatus('success');
  }

  if (status === 'success') {
    return (
      <section className="rounded-2xl border border-[var(--rule)] bg-[var(--paper-2)] p-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">Saved</p>
        <h2 className="mt-3 font-display text-2xl text-[var(--ink)]">Progress saved here. Next lesson ready.</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">
          This browser will remember your path, and your email is saved for the next lesson loop.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[1.5rem] bg-white/85 p-6 shadow-panel backdrop-blur">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">Save progress</p>
      <h2 className="mt-3 font-display text-2xl text-[var(--ink)]">Want the next lesson?</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">
        Your progress is already saved in this browser. Add your email if you want the next lesson path.
      </p>
      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="cognates-email">Email</label>
        <input
          id="cognates-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="min-h-12 flex-1 rounded-full border border-[var(--rule)] bg-[var(--paper)] px-5 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        />
        <input
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-12 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </form>
      {status === 'error' ? (
        <p className="mt-3 text-sm text-[var(--accent)]">{errorMessage}</p>
      ) : null}
    </section>
  );
}
