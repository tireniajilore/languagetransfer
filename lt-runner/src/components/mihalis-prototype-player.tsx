'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserSTT } from '@/adapters/stt/browser-stt';
import { useLessonEngine } from '@/engine/use-lesson-engine';
import { trackEvent, trackEventOnce } from '@/lib/analytics';
import { evaluateSpokenResponse } from '@/lib/evaluate-response';
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
    <div className="rounded-[2rem] border border-sun/30 bg-sun/10 px-5 py-4">
      <p className="text-sm font-medium text-ink/70">{text}</p>
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
  const [listeningMessage, setListeningMessage] = useState('Listening for Spanish...');
  const [speechUnavailable, setSpeechUnavailable] = useState(false);
  const sttRef = useRef<BrowserSTT | null>(null);
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
    promptNudgeMessage: "Tap when you're ready to hear it."
  });

  const activeStep = useMemo(() => {
    if (currentStep) return currentStep;
    return state.lesson.steps[state.lesson.steps.length - 1];
  }, [currentStep, state.lesson.steps]);

  const isWaitingForReveal = state.mode === 'waiting_for_response' && currentStep?.type === 'prompt';
  const waitingText = speechUnavailable
    ? 'Speech recognition is unavailable in this browser.'
    : listeningMessage;
  const showDegradedNotice = playback.degradedStepId === activeStep?.id;
  const completionPercent = Math.round(
    (Math.min(state.currentStepIndex + 1, state.lesson.steps.length) / state.lesson.steps.length) * 100
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sttRef.current = new BrowserSTT();

    return () => {
      sttRef.current?.cancelListening();
    };
  }, []);

  useEffect(() => {
    if (!hasBegun || !isWaitingForReveal || playback.status === 'playing') return;

    let cancelled = false;

    async function listen() {
      try {
        setSpeechUnavailable(false);
        setListeningMessage('Listening for Spanish...');

        const transcript = await sttRef.current?.listenForCompleteUtterance();
        if (cancelled) return;

        const spoken = transcript?.trim() ?? '';
        if (!spoken) {
          setListeningMessage('Listening for Spanish...');
          window.setTimeout(() => {
            if (!cancelled) listen();
          }, 250);
          return;
        }

        setListeningMessage('Got it.');
        const evaluation = evaluateSpokenResponse(spoken, currentStep?.acceptedAnswers);
        void trackEvent('mihalis_voice_response_heard', {
          lessonId: lesson.id,
          stepId: currentStep?.id,
          currentStepIndex: state.currentStepIndex,
          completionPercent,
          isCorrect: evaluation.isCorrect,
          confidence: Number(evaluation.confidence.toFixed(2)),
          responseLength: spoken.length,
          acceptedAnswerCount: currentStep?.acceptedAnswers?.length ?? 0
        });
        submitResponse(
          spoken,
          evaluation
        );
      } catch {
        if (!cancelled) {
          setSpeechUnavailable(true);
        }
      }
    }

    listen();

    return () => {
      cancelled = true;
      sttRef.current?.cancelListening();
    };
  }, [
    hasBegun,
    isWaitingForReveal,
    playback.status,
    currentStep,
    state.currentStepIndex,
    lesson.id,
    completionPercent,
    submitResponse
  ]);

  useEffect(() => {
    if (!hasBegun || state.mode === 'idle') return;

    const commonProps = {
      lessonId: lesson.id,
      prototype: 'mihalis_voice',
      currentStepIndex: state.currentStepIndex,
      completionPercent
    };

    if (completionPercent >= 25) {
      trackEventOnce(`${lesson.id}-mihalis-progress-25`, 'lesson_progress_25', commonProps);
    }
    if (completionPercent >= 50) {
      trackEventOnce(`${lesson.id}-mihalis-progress-50`, 'lesson_progress_50', commonProps);
    }
    if (completionPercent >= 75) {
      trackEventOnce(`${lesson.id}-mihalis-progress-75`, 'lesson_progress_75', commonProps);
    }
  }, [completionPercent, hasBegun, lesson.id, state.currentStepIndex, state.mode]);

  useEffect(() => {
    if (state.mode !== 'completed') return;

    trackEventOnce(`${lesson.id}-mihalis-completed`, 'mihalis_prototype_completed', {
      lessonId: lesson.id,
      prototype: 'mihalis_voice',
      completionPercent: 100,
      responseCount: state.responses.length
    });
  }, [lesson.id, state.mode, state.responses.length]);

  const handleRestart = () => {
    sttRef.current?.cancelListening();
    restart();
    window.setTimeout(() => start(), 0);
  };

  if (!hasBegun) {
    return (
      <main className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
          <section className="w-full rounded-[2.5rem] bg-white/80 p-8 text-center shadow-panel backdrop-blur md:p-12">
            <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-5xl">
              Listen. Say it out loud. Then reveal it.
            </h1>
            <div className="mt-10">
              <button
                onClick={() => {
                  setHasBegun(true);
                  trackEventOnce(`${lesson.id}-mihalis-started`, 'mihalis_prototype_started', {
                    lessonId: lesson.id,
                    prototype: 'mihalis_voice',
                    completionPercent: 0
                  });
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{lesson.title}</h1>
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
        </section>

        {showDegradedNotice ? <DegradedNotice /> : null}

        {isWaitingForReveal ? (
          <>
            <WaitingPanel text={waitingText} />
            {speechUnavailable ? (
              <div className="flex justify-start">
                <button
                  onClick={() => submitResponse('spoken')}
                  disabled={!isWaitingForReveal || playback.status === 'playing'}
                  className="rounded-full bg-ink px-7 py-4 text-base font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/30"
                >
                  Continue
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
