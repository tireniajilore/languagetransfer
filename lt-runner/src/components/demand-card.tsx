'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { getClientSessionContext } from '@/lib/session';
import type { DemandSubmissionRequest, NextLessonInterest } from '@/types/demand';

interface DemandCardProps {
  lessonId: string;
  completionPercent: number;
}

const ratingOptions = [1, 2, 3, 4, 5];

export function DemandCard({ lessonId, completionPercent }: DemandCardProps) {
  const [interest, setInterest] = useState<NextLessonInterest | ''>('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const needsEmail = interest === 'yes' || interest === 'maybe';

  const canSubmit = useMemo(() => {
    if (!interest || !rating) return false;
    if (needsEmail && !email.trim()) return false;
    return true;
  }, [interest, rating, needsEmail, email]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    if (!interest || !rating) return;

    const context = getClientSessionContext();
    if (!context) {
      setStatus('error');
      setErrorMessage('Unable to create a session for this browser.');
      return;
    }

    setStatus('submitting');
    setErrorMessage(null);

    const payload: DemandSubmissionRequest = {
      sessionId: context.sessionId,
      lessonId,
      completedLesson: true,
      completionPercent,
      wantsNextLesson: interest,
      email: needsEmail ? email.trim() : undefined,
      rating,
      feedbackText: feedbackText.trim() || undefined,
      referrer: context.referrer,
      utmSource: context.utmSource,
      utmMedium: context.utmMedium,
      utmCampaign: context.utmCampaign,
      honeypot
    };

    const response = await fetch('/api/demand', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setStatus('error');
      setErrorMessage(body?.error ?? 'Unable to save your response right now.');
      return;
    }

    trackEvent('demand_submitted', {
      lessonId,
      completionPercent,
      wantsNextLesson: interest,
      rating,
      emailCaptured: Boolean(needsEmail && email.trim())
    });

    setStatus('success');
  }

  if (status === 'success') {
    return (
      <section className="rounded-[2rem] bg-white/80 p-8 shadow-panel backdrop-blur">
        <p className="text-sm uppercase tracking-[0.25em] text-ink/45">Thanks</p>
        <h3 className="mt-4 text-3xl font-semibold text-ink">That’s really helpful.</h3>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
          I’ve saved your response. If you left your email, I’ll use it to send the next lesson when it’s ready.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-white/80 p-8 shadow-panel backdrop-blur">
      <p className="text-sm uppercase tracking-[0.25em] text-ink/45">Next Lesson</p>
      <h3 className="mt-4 text-3xl font-semibold text-ink">Would you want the next lesson like this?</h3>
      <p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
        I’m testing whether this format is worth building out. A quick answer here tells me a lot.
      </p>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-ink/70">Would you continue?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(['yes', 'maybe', 'no'] as NextLessonInterest[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setInterest(option)}
                className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                  interest === option
                    ? 'bg-leaf text-white'
                    : 'border border-ink/15 bg-white text-ink hover:bg-white/90'
                }`}
              >
                {option === 'yes' ? 'Yes' : option === 'maybe' ? 'Maybe' : 'No'}
              </button>
            ))}
          </div>
        </div>

        {needsEmail ? (
          <div>
            <label htmlFor="demand-email" className="text-sm font-medium text-ink/70">
              Email
            </label>
            <input
              id="demand-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-ink/30"
            />
          </div>
        ) : null}

        <div>
          <p className="text-sm font-medium text-ink/70">How useful was this lesson?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {ratingOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className={`h-11 w-11 rounded-full text-sm font-semibold transition ${
                  rating === value
                    ? 'bg-coral text-white'
                    : 'border border-ink/15 bg-white text-ink hover:bg-white/90'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="demand-feedback" className="text-sm font-medium text-ink/70">
            What felt confusing or frustrating?
          </label>
          <textarea
            id="demand-feedback"
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            rows={4}
            placeholder="Optional, but very useful."
            className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-ink/30"
          />
        </div>

        <div className="hidden" aria-hidden="true">
          <label htmlFor="company">Company</label>
          <input
            id="company"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {errorMessage ? (
          <p className="text-sm text-coral">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit || status === 'submitting'}
          className="rounded-full bg-ink px-6 py-4 text-base font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          {status === 'submitting' ? 'Saving...' : 'Send feedback'}
        </button>
      </form>
    </section>
  );
}
