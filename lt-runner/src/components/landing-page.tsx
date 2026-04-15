'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { trackEventOnce } from '@/lib/analytics';

export function LandingPage() {
  useEffect(() => {
    trackEventOnce('landing_viewed', 'landing_viewed');
  }, []);

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <section className="rounded-[2rem] bg-white/80 p-12 shadow-panel backdrop-blur text-center">
          <h1 className="text-4xl font-bold tracking-tight text-ink md:text-[42px] md:leading-[1.15]">
            You&apos;ll be speaking Spanish sentences in 10 minutes.
          </h1>
          <p className="mt-5 mx-auto max-w-md text-[17px] leading-7 text-ink/60">
            No memorization. No flashcards. You hear a prompt, think it through, then say it out loud.
          </p>

          <div className="mt-9">
            <Link
              href="/lesson/2?autostart=1"
              className="inline-flex items-center justify-center rounded-full bg-leaf px-12 py-5 text-lg font-semibold text-white transition hover:bg-leaf/90 hover:scale-[1.02] min-w-[240px]"
            >
              Start Now
            </Link>
            <p className="mt-4 text-sm text-ink/35">Best with headphones.</p>
          </div>

          <div className="mt-8 border-t border-ink/[0.08] pt-6">
            <p className="text-sm text-ink/45">
              Based on <span className="font-semibold text-ink/60">Language Transfer</span>, used by thousands of learners worldwide.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
