import type { Lesson, LessonStep } from '@/types/lesson';

export type EngineMode =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'waiting_for_response'
  | 'completed';

export type ResponseKind = 'submitted' | 'skipped' | 'timed_out';

export interface ResponseRecord {
  stepId: string;
  stepIndex: number;
  promptText: string;
  response: string;
  kind: ResponseKind;
  acceptedAnswers?: string[];
}

export interface WaitingState {
  totalSeconds: number;
  secondsRemaining: number;
  startedAt: number;
  fallbackMessage: string | null;
}

export interface EngineState {
  lesson: Lesson;
  mode: EngineMode;
  currentStepIndex: number;
  currentInput: string;
  responses: ResponseRecord[];
  waiting: WaitingState | null;
}

export interface MovePayload {
  targetIndex: number;
}

export interface WaitingTickPayload {
  secondsRemaining: number;
}

export interface FallbackPayload {
  message: string | null;
}

export interface SubmitResponsePayload {
  response: string;
  kind: ResponseKind;
}

export type EngineAction =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESTART' }
  | { type: 'STEP_COMPLETE' }
  | { type: 'PROMPT_REACHED'; totalSeconds: number }
  | { type: 'SET_INPUT'; value: string }
  | { type: 'RESPOND'; payload: SubmitResponsePayload }
  | { type: 'SKIP' }
  | { type: 'TIMEOUT' }
  | { type: 'SET_WAITING_TICK'; payload: WaitingTickPayload }
  | { type: 'SET_FALLBACK_MESSAGE'; payload: FallbackPayload }
  | { type: 'NEXT_STEP' }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'JUMP_TO_STEP'; payload: MovePayload }
  | { type: 'SKIP_INTRO' };

export interface LessonEngineSnapshot {
  state: EngineState;
  currentStep: LessonStep | undefined;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
}
