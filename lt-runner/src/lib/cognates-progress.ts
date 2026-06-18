'use client';

import { COGNATES_COURSE_VERSION } from '@/data/cognates/course';
import type { ResponseKind } from '@/types/engine';

const STORAGE_KEY = 'voiceai.cognates.progress';

export interface PromptProgress {
  stepId: string;
  sectionId: string;
  sourceScriptId: string;
  kind: ResponseKind;
  responseLength: number;
  updatedAt: string;
}

export interface LessonProgress {
  lessonId: string;
  startedAt?: string;
  completedAt?: string;
  lastStepIndex: number;
  completedSections: string[];
  prompts: Record<string, PromptProgress>;
}

export interface CognatesProgress {
  courseVersion: string;
  updatedAt: string;
  lessons: Record<string, LessonProgress>;
  savedEmail?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function createEmptyProgress(): CognatesProgress {
  return {
    courseVersion: COGNATES_COURSE_VERSION,
    updatedAt: nowIso(),
    lessons: {}
  };
}

function normalizeProgress(raw: unknown): CognatesProgress {
  if (!raw || typeof raw !== 'object') return createEmptyProgress();

  const candidate = raw as Partial<CognatesProgress>;
  if (candidate.courseVersion !== COGNATES_COURSE_VERSION) {
    return createEmptyProgress();
  }

  return {
    courseVersion: COGNATES_COURSE_VERSION,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : nowIso(),
    lessons: candidate.lessons && typeof candidate.lessons === 'object' ? candidate.lessons : {},
    savedEmail: typeof candidate.savedEmail === 'string' ? candidate.savedEmail : undefined
  };
}

export function loadCognatesProgress(): CognatesProgress {
  if (typeof window === 'undefined') return createEmptyProgress();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return createEmptyProgress();
  }
}

export function saveCognatesProgress(progress: CognatesProgress) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...progress,
      updatedAt: nowIso()
    }));
  } catch {
    // Local progress is best-effort; network save is never allowed to depend on it.
  }
}

export function getLessonProgress(progress: CognatesProgress, lessonId: string): LessonProgress | null {
  return progress.lessons[lessonId] ?? null;
}

export function upsertLessonProgress(
  progress: CognatesProgress,
  lessonId: string,
  updater: (lesson: LessonProgress) => LessonProgress
) {
  const existing = progress.lessons[lessonId] ?? {
    lessonId,
    lastStepIndex: 0,
    completedSections: [],
    prompts: {}
  };

  return {
    ...progress,
    updatedAt: nowIso(),
    lessons: {
      ...progress.lessons,
      [lessonId]: updater(existing)
    }
  };
}

export function resetLessonProgress(progress: CognatesProgress, lessonId: string): CognatesProgress {
  const { [lessonId]: _removedLesson, ...lessons } = progress.lessons;

  return {
    ...progress,
    updatedAt: nowIso(),
    lessons
  };
}

export function countCompletedLessons(progress: CognatesProgress) {
  return Object.values(progress.lessons).filter((lesson) => Boolean(lesson.completedAt)).length;
}

export function getNextLessonId(progress: CognatesProgress, lessonIds: string[]) {
  return lessonIds.find((lessonId) => !progress.lessons[lessonId]?.completedAt) ?? lessonIds[lessonIds.length - 1];
}
