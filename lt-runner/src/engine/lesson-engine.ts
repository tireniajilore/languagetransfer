import type {
  EngineAction,
  EngineState,
  ResponseRecord
} from '@/types/engine';
import type { Lesson } from '@/types/lesson';

function clampIndex(index: number, lesson: Lesson) {
  if (lesson.steps.length === 0) return 0;
  return Math.max(0, Math.min(index, lesson.steps.length - 1));
}

function nextModeForIndex(index: number, lesson: Lesson): EngineState['mode'] {
  return index >= lesson.steps.length ? 'completed' : 'playing';
}

function buildResponseRecord(state: EngineState, kind: ResponseRecord['kind'], response: string): ResponseRecord {
  const promptStep = state.lesson.steps[state.currentStepIndex];
  return {
    stepId: promptStep.id,
    stepIndex: state.currentStepIndex,
    promptText: promptStep.text,
    response,
    kind,
    acceptedAnswers: promptStep.acceptedAnswers
  };
}

function advanceWithResponse(state: EngineState, kind: ResponseRecord['kind'], response: string): EngineState {
  const nextIndex = state.currentStepIndex + 1;
  return {
    ...state,
    currentInput: '',
    currentStepIndex: nextIndex,
    mode: nextModeForIndex(nextIndex, state.lesson),
    waiting: null,
    responses: [...state.responses, buildResponseRecord(state, kind, response)]
  };
}

function advanceWithoutResponse(state: EngineState): EngineState {
  const nextIndex = state.currentStepIndex + 1;
  return {
    ...state,
    currentInput: '',
    currentStepIndex: nextIndex,
    mode: nextModeForIndex(nextIndex, state.lesson),
    waiting: null
  };
}

function moveToStep(state: EngineState, targetIndex: number): EngineState {
  return {
    ...state,
    currentInput: '',
    currentStepIndex: targetIndex,
    mode: 'playing',
    waiting: null
  };
}

export function createInitialEngineState(lesson: Lesson): EngineState {
  return {
    lesson,
    mode: 'idle',
    currentStepIndex: 0,
    currentInput: '',
    responses: [],
    waiting: null
  };
}

export function lessonEngineReducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        mode: state.lesson.steps.length > 0 ? 'playing' : 'completed',
        currentStepIndex: 0,
        currentInput: '',
        waiting: null,
        responses: []
      };
    case 'PAUSE':
      if (state.mode !== 'playing') return state;
      return { ...state, mode: 'paused' };
    case 'RESUME':
      if (state.mode === 'paused') {
        return { ...state, mode: 'playing' };
      }
      return state;
    case 'RESTART':
      return createInitialEngineState(state.lesson);
    case 'PROMPT_REACHED':
      return {
        ...state,
        mode: 'waiting_for_response',
        waiting: {
          totalSeconds: action.totalSeconds,
          secondsRemaining: action.totalSeconds,
          startedAt: Date.now(),
          fallbackMessage: null
        }
      };
    case 'SET_WAITING_TICK':
      if (state.mode !== 'waiting_for_response' || !state.waiting) return state;
      return {
        ...state,
        waiting: {
          ...state.waiting,
          secondsRemaining: action.payload.secondsRemaining
        }
      };
    case 'SET_FALLBACK_MESSAGE':
      if (!state.waiting) return state;
      return {
        ...state,
        waiting: {
          ...state.waiting,
          fallbackMessage: action.payload.message
        }
      };
    case 'SET_INPUT':
      return {
        ...state,
        currentInput: action.value
      };
    case 'RESPOND':
      return advanceWithResponse(state, action.payload.kind, action.payload.response);
    case 'SKIP':
      return advanceWithResponse(state, 'skipped', '');
    case 'TIMEOUT':
      return state.lesson.steps[state.currentStepIndex]?.type === 'open_prompt'
        ? advanceWithoutResponse(state)
        : advanceWithResponse(state, 'timed_out', '');
    case 'STEP_COMPLETE': {
      const nextIndex = state.currentStepIndex + 1;
      return {
        ...state,
        currentStepIndex: nextIndex,
        mode: nextModeForIndex(nextIndex, state.lesson),
        waiting: null
      };
    }
    case 'NEXT_STEP':
      return moveToStep(state, clampIndex(state.currentStepIndex + 1, state.lesson));
    case 'PREVIOUS_STEP':
      return moveToStep(state, clampIndex(state.currentStepIndex - 1, state.lesson));
    case 'JUMP_TO_STEP':
      return moveToStep(state, clampIndex(action.payload.targetIndex, state.lesson));
    default:
      return state;
  }
}
