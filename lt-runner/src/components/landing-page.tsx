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
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] bg-white/80 p-8 shadow-panel backdrop-blur md:p-12">
          <p className="text-sm uppercase tracking-[0.3em] text-ink/45">VoiceAI</p>
          <div className="mt-5 max-w-4xl">
            <h1 className="text-4xl font-semibold tracking-tight text-ink md:text-6xl">
              Learn Spanish by thinking first, then saying it out loud.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-ink/70">
              This is a live test of an interactive Spanish lesson inspired by the Language Transfer
              method. You will hear a prompt, pause to work it out, then continue. No chatbot, no grading,
              just one carefully guided lesson.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
            <Link
              href="/lesson/2?autostart=1"
              className="inline-flex w-fit items-center rounded-full bg-leaf px-6 py-4 text-base font-semibold text-white transition hover:bg-leaf/90"
            >
              Start Free Lesson
            </Link>
            <p className="text-sm text-ink/55">
              About 10 minutes. Best with headphones. You can speak aloud or type your answers.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
