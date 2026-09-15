import type {
  EngineAction,
  EngineState,
  ResponseRecord
} from '@/types/engine';
import type { Lesson } from '@/types/lesson';
import { matchAnswer } from '@/lib/answer-match';

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

// A submitted answer is scored here rather than in the component, because the
// match is a pure function of (response, acceptedAnswers) and belongs with the
// rest of the state transition. Only a genuinely WRONG answer changes the
// lesson's shape; right and unclear advance exactly as they always have, so the
// blast radius of this feature is one branch.
function respondToSubmission(state: EngineState, response: string): EngineState {
  const promptStep = state.lesson.steps[state.currentStepIndex];
  const record = buildResponseRecord(state, 'submitted', response);
  const { outcome, heard } = matchAnswer(response, promptStep?.acceptedAnswers);

  if (outcome !== 'wrong') {
    const nextIndex = state.currentStepIndex + 1;
    return {
      ...state,
      currentInput: '',
      currentStepIndex: nextIndex,
      mode: nextModeForIndex(nextIndex, state.lesson),
      waiting: null,
      responding: null,
      responses: [...state.responses, record]
    };
  }

  // Hold position. The tutor speaks before we move to the reveal.
  return {
    ...state,
    currentInput: '',
    mode: 'responding',
    waiting: null,
    responding: { outcome, heard, correction: null, pending: true },
    responses: [...state.responses, record]
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
    responding: null,
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
    waiting: null,
    responding: null
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
        responding: null,
        responses: []
      };
    case 'PAUSE':
      if (state.mode !== 'playing' && state.mode !== 'waiting_for_response') return state;
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
      return action.payload.kind === 'submitted'
        ? respondToSubmission(state, action.payload.response)
        : advanceWithResponse(state, action.payload.kind, action.payload.response);
    case 'CORRECTION_READY':
      if (state.mode !== 'responding' || !state.responding) return state;
      return {
        ...state,
        responding: { ...state.responding, correction: action.payload.correction, pending: false }
      };
    case 'RESPONSE_DONE': {
      // The tutor has finished speaking. Now advance to the reveal.
      if (state.mode !== 'responding') return state;
      const nextIndex = state.currentStepIndex + 1;
      return {
        ...state,
        currentStepIndex: nextIndex,
        mode: nextModeForIndex(nextIndex, state.lesson),
        responding: null
      };
    }
    case 'SKIP':
      return state.lesson.steps[state.currentStepIndex]?.type === 'open_prompt'
        ? advanceWithoutResponse(state)
        : advanceWithResponse(state, 'skipped', '');
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
    case 'SKIP_INTRO': {
      const firstPromptIndex = state.lesson.steps.findIndex(s => s.type === 'prompt');
      if (firstPromptIndex <= 0) return state;
      return moveToStep(state, firstPromptIndex);
    }
    default:
      return state;
  }
}
