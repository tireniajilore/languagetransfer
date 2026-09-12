import type { Lesson, LessonStep } from '@/types/lesson';

export type EngineMode =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'waiting_for_response'
  // The learner has answered and we are deciding what the tutor says back.
  // Before this existed, RESPOND advanced straight to the next step, which is
  // why speaking, typing and timing out all produced the identical lesson.
  | 'responding'
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

/** What the tutor is saying back, once the answer has been scored. */
export interface RespondingState {
  outcome: 'right' | 'wrong' | 'unclear';
  /** Normalized transcript, kept for the correction prompt and the log. */
  heard: string;
  /** Correction text once it arrives. Null while it is being fetched. */
  correction: string | null;
  /** True while the correction request is in flight. */
  pending: boolean;
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
  responding: RespondingState | null;
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
  | { type: 'SCORED'; payload: { outcome: 'right' | 'wrong' | 'unclear'; heard: string } }
  | { type: 'CORRECTION_READY'; payload: { correction: string | null } }
  | { type: 'RESPONSE_DONE' }
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
