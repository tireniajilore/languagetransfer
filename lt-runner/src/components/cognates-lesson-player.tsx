'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserSTT } from '@/adapters/stt/browser-stt';
import { CognatesSaveProgressCard } from '@/components/cognates-save-progress-card';
import { COGNATES_COURSE_VERSION } from '@/data/cognates/course';
import { useLessonEngine } from '@/engine/use-lesson-engine';
import {
  countCompletedLessons,
  loadCognatesProgress,
  saveCognatesProgress,
  upsertLessonProgress,
  type CognatesProgress
} from '@/lib/cognates-progress';
import { trackEvent, trackEventOnce } from '@/lib/analytics';
import type { ResponseKind } from '@/types/engine';
import type { LessonStep } from '@/types/lesson';
import type { CognatesLessonBundle } from '@/data/cognates/adapter';

interface CognatesLessonPlayerProps {
  bundle: CognatesLessonBundle;
}

function eventForResponse(kind: ResponseKind) {
  if (kind === 'submitted') return 'cognates_response_submitted' as const;
  if (kind === 'skipped') return 'cognates_response_skipped' as const;
  return 'cognates_response_timed_out' as const;
}

function getStepSection(step?: LessonStep) {
  return step?.metadata?.sectionTitle ?? 'Listen';
}

function getStepCaption(step?: LessonStep) {
  if (!step) return 'That pattern is yours now.';
  return step.caption ?? step.text;
}

function responseQuality(responses: Array<{ kind: ResponseKind }>) {
  return responses.reduce((counts, response) => {
    counts[response.kind] += 1;
    return counts;
  }, {
    submitted: 0,
    skipped: 0,
    timed_out: 0
  } as Record<ResponseKind, number>);
}

const EQ_BARS = [0, 1, 2, 3, 4, 5, 6];

// Ambient — reads as "audio is playing". It is deliberately NOT word-synced,
// so it can never mismatch the spoken word the way a live caption would.
function Equalizer({ paused }: { paused: boolean }) {
  return (
    <div className={`flex h-14 items-end gap-1.5 ${paused ? 'eq-paused' : ''}`} aria-hidden="true">
      {EQ_BARS.map((index) => (
        <span
          key={index}
          className="eq-bar w-1.5 rounded-full"
          style={{
            height: '100%',
            background: index === 3 ? 'var(--accent)' : 'var(--ink-3)',
            animationDelay: `${index * 0.1}s`,
            animationDuration: `${0.82 + (index % 3) * 0.22}s`
          }}
        />
      ))}
    </div>
  );
}

const ghostButton =
  'rounded-full border border-[var(--rule)] bg-[var(--paper)] px-4 py-1.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40';

const primaryButton =
  'rounded-full bg-[var(--accent)] px-7 py-3.5 text-base font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40';

export function CognatesLessonPlayer({ bundle }: CognatesLessonPlayerProps) {
  const [progress, setProgress] = useState<CognatesProgress | null>(null);
  const [speechStatus, setSpeechStatus] = useState<'idle' | 'listening' | 'unavailable' | 'empty'>('idle');
  const [checkpoint, setCheckpoint] = useState<{
    sectionId: string;
    title: string;
    number: number;
    total: number;
    resumeIndex: number;
  } | null>(null);
  const [checkpointTicked, setCheckpointTicked] = useState(false);
  const sttRef = useRef<BrowserSTT | null>(null);
  const checkpointedSectionIds = useRef(new Set<string>());
  const reachedPromptIds = useRef(new Set<string>());
  const revealStepIds = useRef(new Set<string>());
  const completedSectionIds = useRef(new Set<string>());
  const trackedResponseCount = useRef(0);
  const trackedCompletion = useRef(false);
  const hasResumed = useRef(false);
  const lessonId = bundle.courseLesson.id;
  const lessonIds = useMemo(() => bundle.course.lessons.map((lesson) => lesson.id), [bundle.course.lessons]);
  const nextCourseLesson = useMemo(() => (
    bundle.course.lessons.find((lesson) => lesson.number === bundle.courseLesson.number + 1)
  ), [bundle.course.lessons, bundle.courseLesson.number]);

  const {
    state,
    currentStep,
    canStart,
    canPause,
    canResume,
    start,
    pause,
    resume,
    restart,
    jumpToStep,
    setInput,
    submitResponse,
    skip
  } = useLessonEngine(bundle.lesson);

  const progressValue = Math.round(
    (Math.min(state.currentStepIndex + 1, bundle.lesson.steps.length) / bundle.lesson.steps.length) * 100
  );
  const isPromptActive = state.mode === 'waiting_for_response' && currentStep?.type === 'prompt';
  const currentSectionIndex = Math.max(
    0,
    bundle.sectionStepRanges.findIndex((range) => (
      state.currentStepIndex >= range.startIndex && state.currentStepIndex <= range.endIndex
    ))
  );
  const pendingCheckpoint = state.mode === 'idle'
    ? null
    : bundle.sectionStepRanges.find((range, index) => (
      index < bundle.sectionStepRanges.length - 1 &&
      state.currentStepIndex > range.endIndex &&
      !checkpointedSectionIds.current.has(range.sectionId)
    )) ?? null;
  const currentLessonProgress = progress?.lessons[lessonId];
  const completedLessons = progress ? countCompletedLessons(progress) : 0;
  const displayedCompletedLessons = state.mode === 'completed' && !currentLessonProgress?.completedAt
    ? Math.min(completedLessons + 1, lessonIds.length)
    : completedLessons;
  const quality = responseQuality(state.responses);

  const commitProgress = useCallback((updater: (current: CognatesProgress) => CognatesProgress) => {
    setProgress((current) => {
      const nextProgress = updater(current ?? loadCognatesProgress());
      saveCognatesProgress(nextProgress);
      return nextProgress;
    });
  }, []);

  useEffect(() => {
    const loaded = loadCognatesProgress();
    setProgress(loaded);
    const completedSections = loaded.lessons[lessonId]?.completedSections ?? [];
    completedSectionIds.current = new Set(completedSections);
    checkpointedSectionIds.current = new Set(completedSections);
    sttRef.current = new BrowserSTT();

    return () => {
      sttRef.current?.cancelListening();
    };
  }, [lessonId]);

  const handleStart = useCallback(() => {
    const saved = loadCognatesProgress();
    const savedLesson = saved.lessons[lessonId];
    const safeStepIndex = Math.max(0, Math.min(savedLesson?.lastStepIndex ?? 0, bundle.lesson.steps.length - 1));

    commitProgress((current) => upsertLessonProgress(current, lessonId, (lessonProgress) => ({
      ...lessonProgress,
      startedAt: lessonProgress.startedAt ?? new Date().toISOString(),
      lastStepIndex: safeStepIndex
    })));

    trackEventOnce(`${lessonId}-cognates-started`, 'cognates_lesson_started', {
      courseId: bundle.course.id,
      courseVersion: COGNATES_COURSE_VERSION,
      courseLessonId: lessonId,
      lessonNumber: bundle.courseLesson.number,
      resumed: safeStepIndex > 0
    });

    start();
    if (safeStepIndex > 0 && !hasResumed.current) {
      hasResumed.current = true;
      window.setTimeout(() => jumpToStep(safeStepIndex), 0);
    }
  }, [
    bundle.course.id,
    bundle.courseLesson.number,
    bundle.lesson.steps.length,
    commitProgress,
    jumpToStep,
    lessonId,
    start
  ]);

  useEffect(() => {
    if (state.mode === 'idle') return;

    commitProgress((current) => upsertLessonProgress(current, lessonId, (lessonProgress) => ({
      ...lessonProgress,
      startedAt: lessonProgress.startedAt ?? new Date().toISOString(),
      lastStepIndex: Math.min(state.currentStepIndex, bundle.lesson.steps.length - 1)
    })));
  }, [bundle.lesson.steps.length, commitProgress, lessonId, state.currentStepIndex, state.mode]);

  useEffect(() => {
    if (state.mode !== 'waiting_for_response' || currentStep?.type !== 'prompt') return;
    if (reachedPromptIds.current.has(currentStep.id)) return;

    reachedPromptIds.current.add(currentStep.id);
    void trackEvent('cognates_prompt_reached', {
      courseId: bundle.course.id,
      courseVersion: COGNATES_COURSE_VERSION,
      courseLessonId: lessonId,
      sectionId: currentStep.metadata?.sectionId,
      sourceScriptId: currentStep.metadata?.sourceScriptId,
      promptId: currentStep.id,
      currentStepIndex: state.currentStepIndex,
      completionPercent: progressValue
    });
  }, [bundle.course.id, currentStep, lessonId, progressValue, state.currentStepIndex, state.mode]);

  useEffect(() => {
    if (state.mode !== 'playing' || currentStep?.type !== 'reveal') return;
    if (revealStepIds.current.has(currentStep.id)) return;

    revealStepIds.current.add(currentStep.id);
    void trackEvent('cognates_reveal_shown', {
      courseId: bundle.course.id,
      courseVersion: COGNATES_COURSE_VERSION,
      courseLessonId: lessonId,
      sectionId: currentStep.metadata?.sectionId,
      sourceScriptId: currentStep.metadata?.sourceScriptId,
      promptId: currentStep.id,
      currentStepIndex: state.currentStepIndex,
      completionPercent: progressValue
    });
  }, [bundle.course.id, currentStep, lessonId, progressValue, state.currentStepIndex, state.mode]);

  useEffect(() => {
    if (state.responses.length <= trackedResponseCount.current) return;

    const newResponses = state.responses.slice(trackedResponseCount.current);
    trackedResponseCount.current = state.responses.length;

    newResponses.forEach((responseRecord) => {
      const step = bundle.lesson.steps[responseRecord.stepIndex];
      if (!step) return;

      commitProgress((current) => upsertLessonProgress(current, lessonId, (lessonProgress) => ({
        ...lessonProgress,
        prompts: {
          ...lessonProgress.prompts,
          [responseRecord.stepId]: {
            stepId: responseRecord.stepId,
            sectionId: step.metadata?.sectionId ?? 'unknown',
            sourceScriptId: step.metadata?.sourceScriptId ?? 'unknown',
            kind: responseRecord.kind,
            responseLength: responseRecord.response.length,
            updatedAt: new Date().toISOString()
          }
        }
      })));

      void trackEvent(eventForResponse(responseRecord.kind), {
        courseId: bundle.course.id,
        courseVersion: COGNATES_COURSE_VERSION,
        courseLessonId: lessonId,
        sectionId: step.metadata?.sectionId,
        sourceScriptId: step.metadata?.sourceScriptId,
        promptId: responseRecord.stepId,
        responseLength: responseRecord.response.length,
        acceptedAnswerCount: responseRecord.acceptedAnswers?.length ?? 0,
        currentStepIndex: responseRecord.stepIndex,
        completionPercent: progressValue
      });
    });
  }, [bundle.course.id, bundle.lesson.steps, commitProgress, lessonId, progressValue, state.responses]);

  useEffect(() => {
    bundle.sectionStepRanges.forEach((range) => {
      const hasCompleted = state.mode === 'completed' || state.currentStepIndex > range.endIndex;
      if (!hasCompleted || completedSectionIds.current.has(range.sectionId)) return;

      completedSectionIds.current.add(range.sectionId);
      commitProgress((current) => upsertLessonProgress(current, lessonId, (lessonProgress) => ({
        ...lessonProgress,
        completedSections: Array.from(new Set([...lessonProgress.completedSections, range.sectionId]))
      })));

      void trackEvent('cognates_section_completed', {
        courseId: bundle.course.id,
        courseVersion: COGNATES_COURSE_VERSION,
        courseLessonId: lessonId,
        sectionId: range.sectionId,
        sourceScriptId: range.sourceScriptId,
        promptCount: range.promptCount,
        completionPercent: progressValue
      });
    });
  }, [bundle.course.id, bundle.sectionStepRanges, commitProgress, lessonId, progressValue, state.currentStepIndex, state.mode]);

  useEffect(() => {
    if (state.mode !== 'completed' || trackedCompletion.current || pendingCheckpoint) return;

    trackedCompletion.current = true;
    commitProgress((current) => upsertLessonProgress(current, lessonId, (lessonProgress) => ({
      ...lessonProgress,
      completedAt: lessonProgress.completedAt ?? new Date().toISOString(),
      lastStepIndex: bundle.lesson.steps.length,
      completedSections: bundle.sectionStepRanges.map((range) => range.sectionId)
    })));

    void trackEvent('cognates_lesson_completed', {
      courseId: bundle.course.id,
      courseVersion: COGNATES_COURSE_VERSION,
      courseLessonId: lessonId,
      lessonNumber: bundle.courseLesson.number,
      responseSubmittedCount: quality.submitted,
      responseSkippedCount: quality.skipped,
      responseTimedOutCount: quality.timed_out,
      sectionCount: bundle.sectionStepRanges.length
    });
    trackEventOnce(`${lessonId}-cognates-save-progress-viewed`, 'cognates_save_progress_viewed', {
      courseId: bundle.course.id,
      courseVersion: COGNATES_COURSE_VERSION,
      courseLessonId: lessonId
    });
  }, [
    bundle.course.id,
    bundle.courseLesson.number,
    bundle.lesson.steps.length,
    bundle.sectionStepRanges,
    commitProgress,
    lessonId,
    quality.skipped,
    quality.submitted,
    quality.timed_out,
    pendingCheckpoint,
    state.mode
  ]);

  // Gate the flow at the end of each micro-lesson (section): pause and surface
  // a checkpoint the learner ticks off. `>` makes the gate resilient if the
  // engine advances one beat before React paints the checkpoint.
  useEffect(() => {
    if (!pendingCheckpoint || checkpoint) return;

    const sectionIndex = bundle.sectionStepRanges.indexOf(pendingCheckpoint);
    checkpointedSectionIds.current.add(pendingCheckpoint.sectionId);
    setCheckpoint({
      sectionId: pendingCheckpoint.sectionId,
      title: pendingCheckpoint.title,
      number: sectionIndex + 1,
      total: bundle.sectionStepRanges.length,
      resumeIndex: Math.min(pendingCheckpoint.endIndex + 1, bundle.lesson.steps.length - 1)
    });
    setCheckpointTicked(false);
    pause();
  }, [bundle.lesson.steps.length, bundle.sectionStepRanges, checkpoint, pause, pendingCheckpoint]);

  function handleCheckpointContinue() {
    const resumeIndex = checkpoint?.resumeIndex;
    setCheckpoint(null);
    setCheckpointTicked(false);
    if (typeof resumeIndex === 'number') {
      jumpToStep(resumeIndex);
    } else {
      resume();
    }
  }

  async function handleSpeechCapture() {
    if (!isPromptActive || !sttRef.current) return;

    setSpeechStatus('listening');
    try {
      const transcript = await sttRef.current.listenForCompleteUtterance();
      const spoken = transcript.trim();
      if (!spoken) {
        setSpeechStatus('empty');
        return;
      }
      setSpeechStatus('idle');
      submitResponse(spoken);
    } catch {
      setSpeechStatus('unavailable');
    }
  }

  function handleTypedSubmit() {
    if (!state.currentInput.trim()) return;
    submitResponse();
  }

  function handleRestart() {
    trackedCompletion.current = false;
    reachedPromptIds.current.clear();
    revealStepIds.current.clear();
    trackedResponseCount.current = 0;
    completedSectionIds.current.clear();
    checkpointedSectionIds.current.clear();
    setCheckpoint(null);
    setCheckpointTicked(false);
    restart();
  }

  function handleSaved(email: string) {
    commitProgress((current) => ({
      ...current,
      savedEmail: email
    }));
  }

  const statusLabel =
    state.mode === 'paused' ? 'Paused'
      : isPromptActive ? 'Your turn'
        : state.mode === 'playing' || state.mode === 'waiting_for_response' ? 'Listening'
          : '';

  // Keying the stage on step + mode is what drives the crossfade: each new
  // beat remounts and fades in, instead of swapping content abruptly.
  const stageKey = `${currentStep?.id ?? 'idle'}-${state.mode}`;
  const inLesson = state.mode !== 'idle' && state.mode !== 'completed';
  const showCheckpoint = Boolean(checkpoint);
  const showControls = inLesson && !showCheckpoint;
  const isResponseDockVisible = isPromptActive && !showCheckpoint;

  return (
    <main className="min-h-screen px-4 pb-10 pt-5 md:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3.75rem)] max-w-2xl flex-col gap-7">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/cognates"
                className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                Cognates
              </Link>
              <p className="truncate text-sm font-semibold text-[var(--ink-2)]">
                Lesson {bundle.courseLesson.number} · {bundle.courseLesson.title}
              </p>
            </div>
            {showControls && (canPause || canResume) ? (
              <button
                onClick={canPause ? pause : resume}
                disabled={!canPause && !canResume}
                className={ghostButton}
              >
                {canPause ? 'Pause' : 'Resume'}
              </button>
            ) : null}
          </div>
          {inLesson ? (
            <div
              className="flex items-center gap-1.5"
              role="progressbar"
              aria-valuenow={progressValue}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Checkpoint progress"
            >
              {bundle.sectionStepRanges.map((range, index) => {
                const span = Math.max(1, range.endIndex - range.startIndex + 1);
                const within = (state.currentStepIndex - range.startIndex + 1) / span;
                const fill = index < currentSectionIndex
                  ? 1
                  : index === currentSectionIndex
                    ? Math.min(1, Math.max(0, within))
                    : 0;
                return (
                  <div key={range.sectionId} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--paper-3)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                      style={{ width: `${fill * 100}%` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          {showControls ? (
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-3)]">
                {getStepSection(currentStep)}
              </p>
              <p className="shrink-0 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Checkpoint {currentSectionIndex + 1} / {bundle.sectionStepRanges.length} · {statusLabel}
              </p>
            </div>
          ) : null}
        </header>

        <section className="relative flex min-h-[clamp(300px,48vh,460px)] flex-1 flex-col items-center justify-center text-center">
          {state.mode === 'idle' ? (
            <div key="idle" className="step-enter flex max-w-md flex-col items-center gap-6">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--ink-3)]">
                Lesson {bundle.courseLesson.number} · {bundle.sectionStepRanges.length} checkpoints
              </p>
              <h1 className="font-display text-[2.5rem] leading-[1.05] text-[var(--ink)] [overflow-wrap:anywhere] md:text-5xl">
                {bundle.courseLesson.title}
              </h1>
              <p className="leading-relaxed text-[var(--ink-2)]">
                Listen first. Say each answer out loud before it&apos;s revealed. Type only if the mic can&apos;t hear you.
              </p>
              <button onClick={handleStart} disabled={!canStart} className={primaryButton}>
                {currentLessonProgress?.lastStepIndex ? 'Resume lesson' : 'Begin lesson'}
              </button>
              {currentLessonProgress?.lastStepIndex ? (
                <button
                  onClick={handleRestart}
                  className="text-sm font-medium text-[var(--ink-3)] underline underline-offset-4 transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                >
                  Start over
                </button>
              ) : null}
            </div>
          ) : showCheckpoint && checkpoint ? (
            <div key={`checkpoint-${checkpoint.sectionId}`} className="step-enter flex flex-col items-center gap-7 text-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                {checkpointTicked ? (
                  <span
                    key="ring"
                    className="checkpoint-ring pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--accent)]"
                    aria-hidden="true"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setCheckpointTicked(true)}
                  disabled={checkpointTicked}
                  aria-pressed={checkpointTicked}
                  aria-label="Mark checkpoint complete"
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${
                    checkpointTicked
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'cursor-pointer border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }`}
                >
                  <svg
                    key={String(checkpointTicked)}
                    viewBox="0 0 24 24"
                    className={`h-11 w-11 ${checkpointTicked ? 'checkpoint-pop' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
              <div className="flex max-w-md flex-col gap-2">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
                  Checkpoint {checkpoint.number} of {checkpoint.total}
                </p>
                <h2 className="font-display text-3xl leading-tight text-[var(--ink)] text-balance [overflow-wrap:anywhere] md:text-4xl">
                  {checkpointTicked ? 'Banked it.' : checkpoint.title}
                </h2>
                <p className="text-[var(--ink-2)]">
                  {checkpointTicked
                    ? `${checkpoint.title} — ${checkpoint.number} of ${checkpoint.total} done.`
                    : 'Tap the circle to bank this checkpoint.'}
                </p>
              </div>
              {checkpointTicked ? (
                <button onClick={handleCheckpointContinue} className={primaryButton}>
                  Continue
                </button>
              ) : null}
            </div>
          ) : state.mode === 'completed' ? (
            <div key="completed" className="step-enter grid w-full gap-5 text-left md:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-2xl border border-[var(--rule)] bg-[var(--paper-2)] p-6">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">Complete</p>
                <h2 className="mt-3 font-display text-2xl text-[var(--ink)]">
                  You finished Lesson {bundle.courseLesson.number}.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">
                  Answered {quality.submitted}, skipped {quality.skipped}, timed out {quality.timed_out}. Honest progress beats fake perfection.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {nextCourseLesson ? (
                    <Link
                      href={`/cognates/${nextCourseLesson.id}`}
                      className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                    >
                      Next lesson
                    </Link>
                  ) : null}
                  <Link
                    href="/cognates"
                    className="rounded-full border border-[var(--rule)] bg-[var(--paper)] px-5 py-3 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                  >
                    Course path
                  </Link>
                </div>
              </section>
              <CognatesSaveProgressCard
                courseLessonId={lessonId}
                completedLessons={displayedCompletedLessons}
                totalLessons={lessonIds.length}
                progress={progress}
                onSaved={handleSaved}
              />
            </div>
          ) : isPromptActive ? (
            <div key={stageKey} className="step-enter flex max-w-2xl flex-col items-center gap-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
                Your turn — say it
              </p>
              <h2 className="font-display text-3xl leading-tight text-[var(--ink)] text-balance [overflow-wrap:anywhere] md:text-[2.6rem]">
                {getStepCaption(currentStep)}
              </h2>
              {currentStep?.metadata?.phoneticHint ? (
                <p className="text-lg text-[var(--ink-2)]">{currentStep.metadata.phoneticHint}</p>
              ) : null}
            </div>
          ) : currentStep?.type === 'reveal' ? (
            <div key={stageKey} className="step-enter flex max-w-2xl flex-col items-center gap-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--success)]">
                Answer
              </p>
              <h2 className="font-display text-3xl leading-tight text-[var(--ink)] text-balance [overflow-wrap:anywhere] md:text-[2.6rem]">
                {getStepCaption(currentStep)}
              </h2>
              {currentStep?.metadata?.phoneticHint ? (
                <p className="text-lg text-[var(--ink-2)]">{currentStep.metadata.phoneticHint}</p>
              ) : null}
            </div>
          ) : (
            <div key={stageKey} className="step-enter flex flex-col items-center">
              <Equalizer paused={state.mode === 'paused'} />
            </div>
          )}
        </section>

        {isResponseDockVisible ? (
          <section className="step-enter flex flex-col gap-3 rounded-2xl border border-[var(--rule)] bg-[var(--paper-2)] p-4 md:p-5">
            <button
              onClick={handleSpeechCapture}
              disabled={speechStatus === 'listening'}
              className="w-full rounded-full bg-[var(--accent)] px-5 py-3.5 text-base font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {speechStatus === 'listening' ? 'Listening…' : 'Speak the answer'}
            </button>
            <div className="relative">
              <label htmlFor="cognates-response" className="sr-only">Type your answer</label>
              <input
                id="cognates-response"
                value={state.currentInput}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleTypedSubmit();
                  }
                }}
                placeholder="…or type it"
                className="min-h-12 w-full rounded-full border border-[var(--rule)] bg-[var(--paper)] pl-5 pr-14 text-base text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              />
              <button
                onClick={handleTypedSubmit}
                disabled={!state.currentInput.trim()}
                aria-label="Submit answer"
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            {speechStatus === 'unavailable' ? (
              <p className="text-sm text-[var(--accent)]">Speech is unavailable here. Type your answer instead.</p>
            ) : null}
            {speechStatus === 'empty' ? (
              <p className="text-sm text-[var(--ink-2)]">I didn&apos;t catch that. Try again or type it.</p>
            ) : null}
            <button
              onClick={skip}
              className="self-center text-sm font-medium text-[var(--ink-3)] underline underline-offset-4 transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              Skip this one
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
