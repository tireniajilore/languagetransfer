'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BrowserTTS } from '@/adapters/tts/browser-tts';
import { ElevenLabsTTS } from '@/adapters/tts/elevenlabs';
import { StaticTTS } from '@/adapters/tts/static-tts';
import { TextTTS } from '@/adapters/tts/text-tts';
import { createInitialEngineState, lessonEngineReducer } from '@/engine/lesson-engine';
import { waitDurationToSeconds } from '@/lib/parse-transcript';
import type { TTSAdapter } from '@/types/adapters';
import type { LessonEngineSnapshot } from '@/types/engine';
import type { Lesson } from '@/types/lesson';

const FALLBACK_MESSAGE = 'Taking note and moving on.';

type WaitingMode = 'auto_timeout' | 'manual_nudge';

interface UseLessonEngineOptions {
  waitingMode?: WaitingMode;
  promptNudgeMessage?: string;
}

interface PlaybackState {
  status: 'idle' | 'playing';
  degradedStepId: string | null;
}

export function useLessonEngine(
  lesson: Lesson,
  options: UseLessonEngineOptions = {}
) {
  const [state, dispatch] = useReducer(lessonEngineReducer, lesson, createInitialEngineState);
  const [playback, setPlayback] = useState<PlaybackState>({ status: 'idle', degradedStepId: null });
  const stepTimerRef = useRef<number | null>(null);
  const waitIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const fallbackAdvanceRef = useRef<number | null>(null);
  const ttsRef = useRef<TTSAdapter | null>(null);

  const clearStepTimer = useCallback(() => {
    if (stepTimerRef.current) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const clearWaitingTimers = useCallback(() => {
    if (waitIntervalRef.current) {
      window.clearInterval(waitIntervalRef.current);
      waitIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (fallbackAdvanceRef.current) {
      window.clearTimeout(fallbackAdvanceRef.current);
      fallbackAdvanceRef.current = null;
    }
  }, []);

  const waitingMode = options.waitingMode ?? 'auto_timeout';
  const promptNudgeMessage = options.promptNudgeMessage ?? FALLBACK_MESSAGE;

  useEffect(() => {
    ttsRef.current = typeof window !== 'undefined'
      ? new StaticTTS(lesson.id, new ElevenLabsTTS(new BrowserTTS()))
      : new TextTTS();

    return () => {
      ttsRef.current?.stop();
    };
  }, []);

  const currentStep = state.lesson.steps[state.currentStepIndex];

  useEffect(() => {
    clearStepTimer();
    clearWaitingTimers();
    ttsRef.current?.stop();

    if (!currentStep) return;
    if (state.mode !== 'playing') return;

    setPlayback({ status: 'playing', degradedStepId: null });

    if (currentStep.type === 'pause') {
      stepTimerRef.current = window.setTimeout(() => {
        setPlayback((current) => ({ status: 'idle', degradedStepId: current.degradedStepId }));
        dispatch({ type: 'STEP_COMPLETE' });
      }, (currentStep.estimatedDuration ?? 2) * 1000);
      return;
    }

    const adapter = ttsRef.current ?? new TextTTS();
    const usingTextOnly = adapter instanceof TextTTS;
    const fallbackDuration = (currentStep.estimatedDuration ?? 2) * 1000;

    const isPrompt = currentStep.type === 'prompt' || currentStep.type === 'open_prompt';

    const handleStepDone = () => {
      setPlayback((current) => ({ status: 'idle', degradedStepId: current.degradedStepId }));
      if (isPrompt) {
        dispatch({
          type: 'PROMPT_REACHED',
          totalSeconds: waitDurationToSeconds(currentStep.waitDuration)
        });
      } else {
        dispatch({ type: 'STEP_COMPLETE' });
      }
    };

    if (usingTextOnly) {
      setPlayback({ status: 'idle', degradedStepId: currentStep.id });
      if (isPrompt) {
        handleStepDone();
      } else {
        stepTimerRef.current = window.setTimeout(handleStepDone, fallbackDuration);
      }
      return;
    }

    let cancelled = false;
    adapter.speak(currentStep.text, currentStep.segments, currentStep.sourceKey)
      .then(() => {
        if (!cancelled) handleStepDone();
      })
      .catch(() => {
        if (cancelled) return;
        setPlayback({ status: 'idle', degradedStepId: currentStep.id });
        if (isPrompt) {
          handleStepDone();
        } else {
          stepTimerRef.current = window.setTimeout(handleStepDone, fallbackDuration);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentStep, state.mode, clearStepTimer, clearWaitingTimers]);

  const waitingStartedAt = state.waiting?.startedAt ?? null;
  const waitingTotalSeconds = state.waiting?.totalSeconds ?? null;
  const waitingForOpenPrompt = currentStep?.type === 'open_prompt';

  useEffect(() => {
    clearWaitingTimers();

    if (state.mode !== 'waiting_for_response' || !waitingStartedAt || !waitingTotalSeconds) return;

    let lastReportedSeconds = waitingTotalSeconds;

    waitIntervalRef.current = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - waitingStartedAt) / 1000);
      const secondsRemaining = Math.max(0, waitingTotalSeconds - elapsedSeconds);
      if (secondsRemaining !== lastReportedSeconds) {
        lastReportedSeconds = secondsRemaining;
        dispatch({
          type: 'SET_WAITING_TICK',
          payload: { secondsRemaining }
        });
      }
    }, 250);

    if (waitingForOpenPrompt) {
      timeoutRef.current = window.setTimeout(() => {
        dispatch({ type: 'TIMEOUT' });
      }, waitingTotalSeconds * 1000);
    } else {
      timeoutRef.current = window.setTimeout(() => {
        dispatch({
          type: 'SET_FALLBACK_MESSAGE',
          payload: { message: promptNudgeMessage }
        });

        if (waitingMode === 'auto_timeout') {
          fallbackAdvanceRef.current = window.setTimeout(() => {
            dispatch({ type: 'TIMEOUT' });
          }, 1200);
        }
      }, waitingTotalSeconds * 1000);
    }

    return () => {
      clearWaitingTimers();
    };
  }, [state.mode, waitingStartedAt, waitingTotalSeconds, waitingForOpenPrompt, clearWaitingTimers, waitingMode, promptNudgeMessage]);

  useEffect(() => {
    return () => {
      clearStepTimer();
      clearWaitingTimers();
      ttsRef.current?.stop();
    };
  }, [clearStepTimer, clearWaitingTimers]);

  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), []);
  const restart = useCallback(() => dispatch({ type: 'RESTART' }), []);
  const next = useCallback(() => dispatch({ type: 'NEXT_STEP' }), []);
  const previous = useCallback(() => dispatch({ type: 'PREVIOUS_STEP' }), []);
  const setInput = useCallback((value: string) => dispatch({ type: 'SET_INPUT', value }), []);
  const submitResponse = useCallback((value?: string) => {
    dispatch({
      type: 'RESPOND',
      payload: {
        response: (value ?? state.currentInput).trim(),
        kind: 'submitted'
      }
    });
  }, [state.currentInput]);
  const skip = useCallback(() => dispatch({ type: 'SKIP' }), []);
  const skipIntro = useCallback(() => dispatch({ type: 'SKIP_INTRO' }), []);

  const firstPromptIndex = useMemo(
    () => state.lesson.steps.findIndex(s => s.type === 'prompt'),
    [state.lesson.steps]
  );

  const snapshot: LessonEngineSnapshot = useMemo(() => ({
    state,
    currentStep,
    canStart: state.mode === 'idle',
    canPause: state.mode === 'playing',
    canResume: state.mode === 'paused',
    canGoPrevious: state.currentStepIndex > 0 && state.mode !== 'idle',
    canGoNext: state.currentStepIndex < state.lesson.steps.length - 1 && state.mode !== 'idle'
  }), [state, currentStep]);

  const canSkipIntro =
    state.mode === 'playing' &&
    firstPromptIndex > 0 &&
    state.currentStepIndex < firstPromptIndex;

  return {
    ...snapshot,
    canSkipIntro,
    playback,
    start,
    pause,
    resume,
    restart,
    next,
    previous,
    setInput,
    submitResponse,
    skip,
    skipIntro
  };
}
