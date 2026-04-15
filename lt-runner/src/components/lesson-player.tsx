'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { Controls } from '@/components/controls';
import { DemandCard } from '@/components/demand-card';
import { ProgressBar } from '@/components/progress-bar';
import { ResponseInput } from '@/components/response-input';
import { ResponseLog } from '@/components/response-log';
import { StepDisplay } from '@/components/step-display';
import { useLessonEngine } from '@/engine/use-lesson-engine';
import { trackEventOnce } from '@/lib/analytics';
import type { Lesson } from '@/types/lesson';

interface LessonPlayerProps {
  lesson: Lesson;
  autostart?: boolean;
}

export function LessonPlayer({ lesson, autostart = false }: LessonPlayerProps) {
  const hasAutoStartedRef = useRef(false);
  const {
    state,
    currentStep,
    canStart,
    canPause,
    canResume,
    canGoPrevious,
    canGoNext,
    canSkipIntro,
    start,
    pause,
    resume,
    restart,
    previous,
    next,
    setInput,
    submitResponse,
    skip,
    skipIntro
  } = useLessonEngine(lesson);

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
  const openPromptActive = state.mode === 'waiting_for_response' && currentStep?.type === 'open_prompt';
  const lessonKey = lesson.id;

  const handleStart = useCallback(() => {
    trackEventOnce(`${lessonKey}-started`, 'lesson_started', {
      lessonId: lesson.id,
      completionPercent: 0,
      currentStepIndex: 0
    });
    start();
  }, [lesson.id, lessonKey, start]);

  useEffect(() => {
    if (!autostart || hasAutoStartedRef.current || !canStart || state.mode !== 'idle') return;

    hasAutoStartedRef.current = true;
    handleStart();
  }, [autostart, canStart, handleStart, state.mode]);

  useEffect(() => {
    if (state.mode === 'idle') return;

    const commonProps = {
      lessonId: lesson.id,
      currentStepIndex: state.currentStepIndex,
      completionPercent: Math.round(progressValue)
    };

    if (progressValue >= 25) {
      trackEventOnce(`${lessonKey}-progress-25`, 'lesson_progress_25', commonProps);
    }
    if (progressValue >= 50) {
      trackEventOnce(`${lessonKey}-progress-50`, 'lesson_progress_50', commonProps);
    }
    if (progressValue >= 75) {
      trackEventOnce(`${lessonKey}-progress-75`, 'lesson_progress_75', commonProps);
    }
  }, [lesson.id, lessonKey, progressValue, state.currentStepIndex, state.mode]);

  useEffect(() => {
    if (currentStep?.type === 'open_prompt' && currentStep.id.startsWith('outro-')) {
      trackEventOnce(`${lessonKey}-outro-prompt`, 'outro_prompt_reached', {
        lessonId: lesson.id,
        currentStepIndex: state.currentStepIndex,
        completionPercent: Math.round(progressValue)
      });
    }
  }, [currentStep, lesson.id, lessonKey, progressValue, state.currentStepIndex]);

  useEffect(() => {
    if (state.mode !== 'completed') return;

    trackEventOnce(`${lessonKey}-completed`, 'lesson_completed', {
      lessonId: lesson.id,
      completionPercent: 100,
      currentStepIndex: state.lesson.steps.length
    });

    trackEventOnce(`${lessonKey}-demand-card`, 'demand_card_viewed', {
      lessonId: lesson.id,
      completionPercent: 100
    });
  }, [lesson.id, lessonKey, state.lesson.steps.length, state.mode]);

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] bg-white/70 p-5 shadow-panel backdrop-blur">
          <Link
            href="/"
            className="text-sm uppercase tracking-[0.3em] text-ink/45 transition hover:text-ink/70"
          >
            Language Transfer
          </Link>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{lesson.title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-ink/65">{lesson.description}</p>
            </div>
            <div className="text-sm text-ink/55">
              <p>{lesson.steps.length} steps</p>
              <p>Speak or type your answer before the tutor continues</p>
            </div>
          </div>
        </header>

        <div className="rounded-[2rem] bg-white/70 p-6 shadow-panel backdrop-blur">
          <Controls
            canStart={canStart}
            canPause={canPause}
            canResume={canResume}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onStart={handleStart}
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

        <div className="grid gap-6 lg:grid-cols-[2.5fr_1fr]">
          <div className="space-y-6">
            <StepDisplay step={currentStep} mode={state.mode} />
            {canSkipIntro && (
              <div className="flex justify-end">
                <button
                  onClick={skipIntro}
                  className="text-sm text-ink/45 underline-offset-2 hover:text-ink/70 hover:underline transition"
                >
                  Skip intro
                </button>
              </div>
            )}
            {state.mode === 'completed' ? (
              <DemandCard lessonId={lesson.id} completionPercent={100} />
            ) : (
              <ResponseInput
                enabled={promptActive}
                allowSkip={promptActive || openPromptActive}
                value={state.currentInput}
                onChange={setInput}
                onSubmit={() => submitResponse()}
                onSkip={skip}
              />
            )}
          </div>

          <ResponseLog responses={state.responses} />
        </div>
      </div>
    </main>
  );
}
