'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { BrowserTTS } from '@/adapters/tts/browser-tts';
import { ElevenLabsTTS } from '@/adapters/tts/elevenlabs';
import { StaticTTS } from '@/adapters/tts/static-tts';
import { TextTTS } from '@/adapters/tts/text-tts';
import { createInitialEngineState, lessonEngineReducer } from '@/engine/lesson-engine';
import { waitDurationToSeconds } from '@/lib/parse-transcript';
import type { TTSAdapter } from '@/types/adapters';
import type { LessonEngineSnapshot } from '@/types/engine';
import type { Lesson, LessonStep } from '@/types/lesson';

const FALLBACK_MESSAGE = 'Taking note and moving on.';

// Beat held after the Spanish reveal audio, before advancing. Mirrors the
// TikTok pipeline's constant post-reveal HOLD: ~1s on a short one-word answer,
// a slightly longer beat on a full-sentence reveal so it doesn't feel clipped.
// The reveal audio has already played; this is only the trailing hold.
function revealHoldMs(step: LessonStep): number {
  const answer = (step.caption ?? step.text ?? '').trim();
  const words = answer ? answer.split(/\s+/).length : 1;
  if (words <= 1) return 1000;
  if (words <= 4) return 1300;
  return 1600;
}

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
    const fallbackTTS = new ElevenLabsTTS(new BrowserTTS());
    const shouldLoadStaticAudio = lesson.audio?.staticManifest !== false;

    ttsRef.current = typeof window !== 'undefined'
      ? shouldLoadStaticAudio
        ? new StaticTTS(lesson.id, fallbackTTS)
        : fallbackTTS
      : new TextTTS();

    return () => {
      ttsRef.current?.stop();
    };
  }, [lesson.audio?.staticManifest, lesson.id]);

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

    const isPrompt = currentStep.type === 'prompt' || currentStep.type === 'open_prompt';

    const handleStepDone = () => {
      if (isPrompt) {
        dispatch({
          type: 'PROMPT_REACHED',
          totalSeconds: waitDurationToSeconds(currentStep.waitDuration)
        });
      } else if (currentStep.type === 'reveal') {
        // Let the Spanish answer breathe before moving on. The audio itself is
        // silence-trimmed, so without this beat the reveal snaps straight into
        // the next step. Beat length scales with the answer (see revealHoldMs).
        stepTimerRef.current = window.setTimeout(() => {
          dispatch({ type: 'STEP_COMPLETE' });
        }, revealHoldMs(currentStep));
      } else {
        dispatch({ type: 'STEP_COMPLETE' });
      }
    };

    if (usingTextOnly) {
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

  // The tutor's turn. Only reached when the answer was scored WRONG, so this is
  // the one branch where the lesson stops replaying and responds to the learner.
  // Everything here degrades to today's behaviour on failure: no key, a network
  // error, or a correction that leaked the answer all end in silence + reveal.
  const responding = state.responding;
  const respondingPending = responding?.pending ?? false;
  const respondingCorrection = responding?.correction ?? null;

  useEffect(() => {
    if (state.mode !== 'responding' || !respondingPending) return;
    let cancelled = false;

    const promptStep = state.lesson.steps[state.currentStepIndex];
    const taughtSoFar = state.lesson.steps
      .slice(0, state.currentStepIndex)
      .map(step => step.text)
      .filter(Boolean);

    fetch('/api/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText: promptStep?.text ?? '',
        acceptedAnswers: promptStep?.acceptedAnswers ?? [],
        heard: responding?.heard ?? '',
        taughtSoFar
      })
    })
      .then(res => (res.ok ? res.json() : { correction: null }))
      .then((data: { correction?: string | null }) => {
        if (!cancelled) {
          dispatch({ type: 'CORRECTION_READY', payload: { correction: data.correction ?? null } });
        }
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'CORRECTION_READY', payload: { correction: null } });
      });

    return () => {
      cancelled = true;
    };
  }, [state.mode, respondingPending, state.currentStepIndex, state.lesson.steps, responding?.heard]);

  useEffect(() => {
    if (state.mode !== 'responding' || respondingPending) return;

    // Nothing to say (no key, error, or the leak check rejected it): fall straight
    // through to the reveal, which is exactly what the app does today.
    if (!respondingCorrection) {
      dispatch({ type: 'RESPONSE_DONE' });
      return;
    }

    let cancelled = false;
    const adapter = ttsRef.current ?? new TextTTS();
    adapter.speak(respondingCorrection)
      .then(() => {
        if (!cancelled) dispatch({ type: 'RESPONSE_DONE' });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'RESPONSE_DONE' });
      });

    return () => {
      cancelled = true;
    };
  }, [state.mode, respondingPending, respondingCorrection]);

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
          payload: { message: FALLBACK_MESSAGE }
        });

        fallbackAdvanceRef.current = window.setTimeout(() => {
          dispatch({ type: 'TIMEOUT' });
        }, 1200);
      }, waitingTotalSeconds * 1000);
    }

    return () => {
      clearWaitingTimers();
    };
  }, [state.mode, waitingStartedAt, waitingTotalSeconds, waitingForOpenPrompt, clearWaitingTimers]);

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
  const jumpToStep = useCallback((targetIndex: number) => dispatch({
    type: 'JUMP_TO_STEP',
    payload: { targetIndex }
  }), []);
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
    start,
    pause,
    resume,
    restart,
    next,
    previous,
    jumpToStep,
    setInput,
    submitResponse,
    skip,
    skipIntro
  };
}
