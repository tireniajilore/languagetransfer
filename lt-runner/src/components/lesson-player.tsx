'use client';

import { useEffect } from 'react';
import { Controls } from '@/components/controls';
import { ProgressBar } from '@/components/progress-bar';
import { ResponseInput } from '@/components/response-input';
import { ResponseLog } from '@/components/response-log';
import { StepDisplay } from '@/components/step-display';
import { WaitingIndicator } from '@/components/waiting-indicator';
import { lesson02 } from '@/data/lesson-02';
import { useLessonEngine } from '@/engine/use-lesson-engine';

export function LessonPlayer() {
  const {
    state,
    currentStep,
    canStart,
    canPause,
    canResume,
    canGoPrevious,
    canGoNext,
    start,
    pause,
    resume,
    restart,
    previous,
    next,
    setInput,
    submitResponse,
    skip
  } = useLessonEngine(lesson02);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;

      if (event.key === ' ') {
        event.preventDefault();
        if (state.mode === 'idle') start();
        else if (state.mode === 'playing') pause();
        else if (state.mode === 'paused') resume();
      }

      if (event.key === 'ArrowRight' && canGoNext) {
        next();
      }

      if (event.key === 'ArrowLeft' && canGoPrevious) {
        previous();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.mode, start, pause, resume, next, previous, canGoNext, canGoPrevious]);

  const progressValue = ((Math.min(state.currentStepIndex + 1, state.lesson.steps.length)) / state.lesson.steps.length) * 100;
  const promptActive = state.mode === 'waiting_for_response' && currentStep?.type === 'prompt';

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] bg-white/70 p-8 shadow-panel backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-ink/45">Language Transfer Runner</p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-semibold tracking-tight text-ink">{lesson02.title}</h1>
              <p className="mt-3 text-base leading-7 text-ink/65">{lesson02.description}</p>
            </div>
            <div className="text-sm text-ink/55">
              <p>{lesson02.steps.length} steps</p>
              <p>Single-lesson MVP, deterministic only</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <StepDisplay step={currentStep} mode={state.mode} />
            <WaitingIndicator waiting={state.waiting} />
            <ResponseInput
              enabled={promptActive}
              value={state.currentInput}
              acceptedAnswers={currentStep?.acceptedAnswers}
              onChange={setInput}
              onSubmit={() => submitResponse()}
              onSkip={skip}
            />
            <div className="rounded-[2rem] bg-white/70 p-6 shadow-panel backdrop-blur">
              <Controls
                canStart={canStart}
                canPause={canPause}
                canResume={canResume}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onStart={start}
                onPause={pause}
                onResume={resume}
                onPrevious={previous}
                onNext={next}
                onRestart={restart}
              />
              <div className="mt-6">
                <ProgressBar value={progressValue} />
              </div>
            </div>
          </div>

          <ResponseLog responses={state.responses} />
        </div>
      </div>
    </main>
  );
}
