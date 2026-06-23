'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { getClientSessionContext } from '@/lib/session';
import type { DemandSubmissionRequest, NextLessonInterest, KeepGoingReason, DiscoveryChannel } from '@/types/demand';

interface DemandCardProps {
  lessonId: string;
  completionPercent: number;
}

const ratingOptions = [1, 2, 3, 4, 5];

const choiceButton =
  'rounded-full border px-5 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

function choiceClass(active: boolean) {
  return active
    ? `${choiceButton} border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]`
    : `${choiceButton} border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]`;
}

function ratingClass(active: boolean) {
  return active
    ? 'h-11 w-11 rounded-full border border-[var(--accent)] bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
    : 'h-11 w-11 rounded-full border border-[var(--rule)] bg-[var(--paper)] text-sm font-semibold text-[var(--ink-2)] transition hover:bg-[var(--paper-3)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';
}

export function DemandCard({ lessonId, completionPercent }: DemandCardProps) {
  const [interest, setInterest] = useState<NextLessonInterest | ''>('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [keepGoingReason, setKeepGoingReason] = useState<KeepGoingReason | ''>('');
  const [discoveryChannel, setDiscoveryChannel] = useState<DiscoveryChannel | ''>('');
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
      keepGoingReason: keepGoingReason || undefined,
      discoveryChannel: discoveryChannel || undefined,
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
      emailCaptured: Boolean(needsEmail && email.trim()),
      keepGoingReason: keepGoingReason || null,
      discoveryChannel: discoveryChannel || null
    });

    setStatus('success');
  }

  if (status === 'success') {
    return (
      <section className="rounded-2xl border border-[var(--rule)] bg-[var(--paper-2)] p-6">
        <p className="text-sm font-semibold text-[var(--accent)]">Thanks</p>
        <h3 className="mt-3 font-display text-2xl text-[var(--ink)]">That’s really helpful.</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-2)]">
          I’ve saved your response. If you left your email, I’ll use it to send the next lesson when it’s ready.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--rule)] bg-[var(--paper-2)] p-6">
      <p className="text-sm font-semibold text-[var(--accent)]">Next lesson</p>
      <h3 className="mt-3 font-display text-2xl text-[var(--ink)]">Would you want the next lesson like this?</h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-2)]">
        I’m testing whether this format is worth building out. A quick answer here tells me a lot.
      </p>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-[var(--ink-2)]">Would you continue?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(['yes', 'maybe', 'no'] as NextLessonInterest[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setInterest(option)}
                className={choiceClass(interest === option)}
              >
                {option === 'yes' ? 'Yes' : option === 'maybe' ? 'Maybe' : 'No'}
              </button>
            ))}
          </div>
        </div>

        {needsEmail ? (
          <div>
            <label htmlFor="demand-email" className="text-sm font-medium text-[var(--ink-2)]">
              Email
            </label>
            <input
              id="demand-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-2 min-h-12 w-full rounded-full border border-[var(--rule)] bg-[var(--paper)] px-5 text-base text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-3)] focus:border-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            />
          </div>
        ) : null}

        <div>
          <p className="text-sm font-medium text-[var(--ink-2)]">What kept you going?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {([
              ['teaching_style', 'The teaching style'],
              ['actually_learning', 'I was actually learning'],
              ['fun', 'It was fun'],
              ['want_spanish', 'I want to learn Spanish'],
            ] as [KeepGoingReason, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKeepGoingReason(value)}
                className={choiceClass(keepGoingReason === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--ink-2)]">How did you find this?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {([
              ['discord', 'Discord'],
              ['reddit', 'Reddit'],
              ['friend', 'Friend'],
              ['search', 'Search'],
              ['other', 'Other'],
            ] as [DiscoveryChannel, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDiscoveryChannel(value)}
                className={choiceClass(discoveryChannel === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--ink-2)]">How useful was this lesson?</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {ratingOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className={ratingClass(rating === value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="demand-feedback" className="text-sm font-medium text-[var(--ink-2)]">
            What felt confusing or frustrating?
          </label>
          <textarea
            id="demand-feedback"
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            rows={4}
            placeholder="Optional, but very useful."
            className="mt-2 w-full rounded-2xl border border-[var(--rule)] bg-[var(--paper)] px-4 py-3 text-base text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-3)] focus:border-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
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
          <p className="text-sm text-[var(--accent)]">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit || status === 'submitting'}
          className="rounded-full bg-[var(--ink)] px-6 py-4 text-base font-semibold text-[var(--paper)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'submitting' ? 'Saving...' : 'Send feedback'}
        </button>
      </form>
    </section>
  );
}
