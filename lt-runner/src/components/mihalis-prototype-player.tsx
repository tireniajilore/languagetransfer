'use client';

import { useMemo, useState } from 'react';
import { useLessonEngine } from '@/engine/use-lesson-engine';
import type { Lesson, LessonStep } from '@/types/lesson';

interface MihalisPrototypePlayerProps {
  lesson: Lesson;
}

function getStepLabel(step?: LessonStep, mode?: string) {
  if (!step) return 'Listen';
  if (mode === 'completed') return 'Finished';
  if (step.type === 'prompt') return 'Your Turn';
  if (step.type === 'reveal') return 'Tutor';
  return 'Listen';
}

function getStepInstruction(step?: LessonStep, mode?: string) {
  if (!step) return 'Keep listening.';
  if (mode === 'completed') return 'The prototype is complete.';
  if (step.type === 'prompt') return 'Say your answer out loud, then reveal it when you are ready.';
  if (step.type === 'reveal') return 'Listen to the answer and continuation.';
  return 'Listen carefully.';
}

function MinimalControls({
  canPause,
  canResume,
  onPause,
  onResume,
  onRestart
}: {
  canPause: boolean;
  canResume: boolean;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
}) {
  const secondaryClass = 'rounded-full border border-ink/15 bg-white/80 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:text-ink/30';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className={secondaryClass}
        onClick={canPause ? onPause : onResume}
        disabled={!canPause && !canResume}
      >
        {canPause ? 'Pause' : canResume ? 'Resume' : 'Pause'}
      </button>
      <button className={secondaryClass} onClick={onRestart}>
        Restart
      </button>
    </div>
  );
}

function WaitingPanel({ text }: { text: string }) {
  return (
    <div className="rounded-[2rem] border border-sun/30 bg-sun/10 p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-ink/45">Pause</p>
      <p className="mt-3 text-base font-medium text-ink">{text}</p>
    </div>
  );
}

function DegradedNotice() {
  return (
    <div className="rounded-[1.5rem] border border-coral/20 bg-coral/10 p-4 text-sm text-ink/75">
      Audio is unavailable for this step. You can still continue with the lesson.
    </div>
  );
}

export function MihalisPrototypePlayer({ lesson }: MihalisPrototypePlayerProps) {
  const [hasBegun, setHasBegun] = useState(false);
  const {
    state,
    currentStep,
    canPause,
    canResume,
    start,
    pause,
    resume,
    restart,
    submitResponse,
    playback
  } = useLessonEngine(lesson, {
    waitingMode: 'manual_nudge',
    promptNudgeMessage: "Tap when you're ready to hear it.",
    ttsMode: 'dynamic_first'
  });

  const activeStep = useMemo(() => {
    if (currentStep) return currentStep;
    return state.lesson.steps[state.lesson.steps.length - 1];
  }, [currentStep, state.lesson.steps]);

  const isWaitingForReveal = state.mode === 'waiting_for_response' && currentStep?.type === 'prompt';
  const waitingText = state.waiting?.fallbackMessage || 'Say it out loud, then tap when you are ready.';
  const showDegradedNotice = playback.degradedStepId === activeStep?.id;

  const handleRestart = () => {
    restart();
    window.setTimeout(() => start(), 0);
  };

  if (!hasBegun) {
    return (
      <main className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
          <section className="w-full rounded-[2.5rem] bg-white/80 p-8 text-center shadow-panel backdrop-blur md:p-12">
            <p className="text-sm uppercase tracking-[0.3em] text-ink/45">Lesson 2 Prototype</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink md:text-5xl">
              Listen. Say it out loud. Then reveal it.
            </h1>
            <div className="mt-10">
              <button
                onClick={() => {
                  setHasBegun(true);
                  window.setTimeout(() => start(), 0);
                }}
                className="inline-flex items-center justify-center rounded-full bg-leaf px-10 py-5 text-lg font-semibold text-white transition hover:bg-leaf/90"
              >
                Begin Lesson 2
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="rounded-[2rem] bg-white/70 p-5 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-ink/45">Lesson 2 Prototype</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{lesson.title}</h1>
              <p className="mt-1 text-sm text-ink/55">Speak your answer out loud before you reveal it.</p>
            </div>
            <MinimalControls
              canPause={canPause}
              canResume={canResume}
              onPause={pause}
              onResume={resume}
              onRestart={handleRestart}
            />
          </div>
        </header>

        <section className="rounded-[2.5rem] bg-white/85 p-6 shadow-panel backdrop-blur md:p-8">
          <p className="text-sm uppercase tracking-[0.25em] text-ink/45">
            {getStepLabel(activeStep, state.mode)}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-ink/70" />
            <span className="h-3 w-3 rounded-full bg-ink/25" />
            <span className="h-3 w-3 rounded-full bg-ink/25" />
          </div>
          <p className="mt-5 text-lg font-medium text-ink md:text-xl">
            {getStepInstruction(activeStep, state.mode)}
          </p>
        </section>

        {showDegradedNotice ? <DegradedNotice /> : null}

        {isWaitingForReveal ? (
          <>
            <WaitingPanel text={waitingText} />
            <div className="flex justify-start">
              <button
                onClick={() => submitResponse('spoken')}
                disabled={!isWaitingForReveal || playback.status === 'playing'}
                className="rounded-full bg-ink px-7 py-4 text-base font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/30"
              >
                I said it
              </button>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
