'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { BrowserTTS } from '@/adapters/tts/browser-tts';
import { ElevenLabsTTS } from '@/adapters/tts/elevenlabs';
import { TextTTS } from '@/adapters/tts/text-tts';
import { createInitialEngineState, lessonEngineReducer } from '@/engine/lesson-engine';
import { waitDurationToSeconds } from '@/lib/parse-transcript';
import type { TTSAdapter } from '@/types/adapters';
import type { LessonEngineSnapshot } from '@/types/engine';
import type { Lesson } from '@/types/lesson';

const FALLBACK_MESSAGE = 'Taking note and moving on.';

export function useLessonEngine(lesson: Lesson) {
  const [state, dispatch] = useReducer(lessonEngineReducer, lesson, createInitialEngineState);
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

  useEffect(() => {
    ttsRef.current = typeof window !== 'undefined'
      ? new ElevenLabsTTS(new BrowserTTS())
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

    if (currentStep.type === 'pause') {
      stepTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'STEP_COMPLETE' });
      }, (currentStep.estimatedDuration ?? 2) * 1000);
      return;
    }

    const adapter = ttsRef.current ?? new TextTTS();
    const usingTextOnly = adapter instanceof TextTTS;
    const fallbackDuration = (currentStep.estimatedDuration ?? 2) * 1000;

    if (usingTextOnly) {
      if (currentStep.type === 'prompt') {
        dispatch({
          type: 'PROMPT_REACHED',
          totalSeconds: waitDurationToSeconds(currentStep.waitDuration)
        });
        return;
      }

      stepTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'STEP_COMPLETE' });
      }, fallbackDuration);
      return;
    }

    let cancelled = false;
    adapter.speak(currentStep.text, currentStep.segments)
      .then(() => {
        if (cancelled) return;
        if (currentStep.type === 'prompt') {
          dispatch({
            type: 'PROMPT_REACHED',
            totalSeconds: waitDurationToSeconds(currentStep.waitDuration)
          });
          return;
        }

        dispatch({ type: 'STEP_COMPLETE' });
      })
      .catch(() => {
        if (cancelled) return;
        if (currentStep.type === 'prompt') {
          dispatch({
            type: 'PROMPT_REACHED',
            totalSeconds: waitDurationToSeconds(currentStep.waitDuration)
          });
          return;
        }

        stepTimerRef.current = window.setTimeout(() => {
          dispatch({ type: 'STEP_COMPLETE' });
        }, fallbackDuration);
      });

    return () => {
      cancelled = true;
    };
  }, [currentStep, state.mode, clearStepTimer, clearWaitingTimers]);

  useEffect(() => {
    clearWaitingTimers();

    if (state.mode !== 'waiting_for_response' || !state.waiting) return;

    waitIntervalRef.current = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - state.waiting!.startedAt) / 1000);
      const secondsRemaining = Math.max(0, state.waiting!.totalSeconds - elapsedSeconds);
      dispatch({
        type: 'SET_WAITING_TICK',
        payload: { secondsRemaining }
      });
    }, 250);

    timeoutRef.current = window.setTimeout(() => {
      dispatch({
        type: 'SET_FALLBACK_MESSAGE',
        payload: { message: FALLBACK_MESSAGE }
      });

      fallbackAdvanceRef.current = window.setTimeout(() => {
        dispatch({ type: 'TIMEOUT' });
      }, 1200);
    }, state.waiting.totalSeconds * 1000);

    return () => {
      clearWaitingTimers();
    };
  }, [state.mode, state.waiting, clearWaitingTimers]);

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

  const snapshot: LessonEngineSnapshot = useMemo(() => ({
    state,
    currentStep,
    canStart: state.mode === 'idle',
    canPause: state.mode === 'playing',
    canResume: state.mode === 'paused',
    canGoPrevious: state.currentStepIndex > 0 && state.mode !== 'idle',
    canGoNext: state.currentStepIndex < state.lesson.steps.length - 1 && state.mode !== 'idle'
  }), [state, currentStep]);

  return {
    ...snapshot,
    start,
    pause,
    resume,
    restart,
    next,
    previous,
    setInput,
    submitResponse,
    skip
  };
}
