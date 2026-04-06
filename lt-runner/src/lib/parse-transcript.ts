import { lesson02Segments } from '@/data/lesson-02-segments';
import type { Lesson, LessonStep, RawLesson, RawLessonTurn, SpeechSegment, WaitDuration } from '@/types/lesson';

const QUESTION_START_PATTERNS = [
  /\bSo how would you\b/i,
  /\bHow would you\b/i,
  /\bHow do you think\b/i,
  /\bWhat if you want to say\b/i,
  /\bWhat was\b/i,
  /\bSo what was\b/i,
  /\bCan you say\b/i
];

const WAIT_BY_TEXT: Record<WaitDuration, number> = {
  short: 3,
  medium: 5,
  long: 8,
  extended: 30
};

type StepPart = 'full' | 'prompt' | 'reveal';

const LESSON_SEGMENT_OVERRIDES: Record<number, Record<string, SpeechSegment[]>> = {
  2: lesson02Segments
};

function estimateDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.min(14, Math.round(words / 2.8)));
}

function inferWaitDuration(text: string): WaitDuration {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 8) return 'short';
  if (words < 18) return 'medium';
  return 'long';
}

function splitFeedbackPromptText(text: string) {
  const explicitPattern = QUESTION_START_PATTERNS
    .map((pattern) => ({ index: text.search(pattern), pattern }))
    .filter((match) => match.index > 0)
    .sort((a, b) => a.index - b.index)[0];

  if (explicitPattern) {
    return {
      revealText: text.slice(0, explicitPattern.index).trim(),
      promptText: text.slice(explicitPattern.index).trim()
    };
  }

  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (sentences.length > 1) {
    const promptText = sentences[sentences.length - 1];
    if (promptText.endsWith('?')) {
      return {
        revealText: sentences.slice(0, -1).join(' ').trim(),
        promptText
      };
    }
  }

  return {
    revealText: '',
    promptText: text.trim()
  };
}

function buildSourceKey(turnIndex: number, part: StepPart) {
  return `turn-${turnIndex + 1}-${part}`;
}

function applySegments(
  lessonNumber: number,
  sourceKey: string,
  step: Omit<LessonStep, 'estimatedDuration'> & { estimatedDuration?: number }
): LessonStep {
  const overrides = LESSON_SEGMENT_OVERRIDES[lessonNumber] ?? {};
  const segments = overrides[sourceKey];

  return {
    ...step,
    sourceKey,
    segments,
    estimatedDuration: step.estimatedDuration ?? (step.text ? estimateDuration(step.text) : 2)
  };
}

function buildPromptStep(
  lessonNumber: number,
  turn: RawLessonTurn,
  turnIndex: number,
  id: string,
  acceptedAnswers?: string[]
): LessonStep {
  return applySegments(lessonNumber, buildSourceKey(turnIndex, 'full'), {
    id,
    type: 'prompt',
    text: turn.text ?? '',
    expectsResponse: true,
    acceptedAnswers,
    waitDuration: inferWaitDuration(turn.text ?? '')
  });
}

export function waitDurationToSeconds(waitDuration: WaitDuration = 'medium') {
  return WAIT_BY_TEXT[waitDuration];
}

export function convertRawLessonToLesson(rawLesson: RawLesson): Lesson {
  const steps: LessonStep[] = [];

  rawLesson.turns.forEach((turn, index, turns) => {
    if (turn.speaker !== 'tutor') return;

    const nextTurn = turns[index + 1];
    const acceptedAnswers = nextTurn?.speaker === 'student' ? nextTurn.expected_answers : undefined;
    const baseId = `step-${steps.length + 1}`;

    if (turn.is_feedback && turn.is_prompt) {
      const { revealText, promptText } = splitFeedbackPromptText(turn.text ?? '');

      if (revealText) {
        steps.push(
          applySegments(rawLesson.lesson_number, buildSourceKey(index, 'reveal'), {
            id: `${baseId}-reveal`,
            type: 'reveal',
            text: revealText
          })
        );
      }

      steps.push(
        applySegments(rawLesson.lesson_number, buildSourceKey(index, 'prompt'), {
          id: `${baseId}-prompt`,
          type: 'prompt',
          text: promptText || turn.text || '',
          expectsResponse: true,
          acceptedAnswers,
          waitDuration: inferWaitDuration(promptText || turn.text || '')
        })
      );
      return;
    }

    if (turn.is_prompt) {
      steps.push(buildPromptStep(rawLesson.lesson_number, turn, index, baseId, acceptedAnswers));
      return;
    }

    if (turn.is_feedback) {
      steps.push(
        applySegments(rawLesson.lesson_number, buildSourceKey(index, 'full'), {
          id: baseId,
          type: 'reveal',
          text: turn.text ?? ''
        })
      );
      return;
    }

    steps.push(
      applySegments(rawLesson.lesson_number, buildSourceKey(index, 'full'), {
        id: baseId,
        type: 'narration',
        text: turn.text ?? ''
      })
    );
  });

  rawLesson.outro?.forEach((entry, index) => {
    steps.push({
      id: `outro-${index + 1}`,
      type: entry.type,
      text: entry.text,
      waitDuration: entry.waitDuration,
      expectsResponse: entry.type === 'open_prompt' ? false : undefined,
      estimatedDuration: estimateDuration(entry.text)
    });
  });

  return {
    id: `lesson-${rawLesson.lesson_number.toString().padStart(2, '0')}`,
    title: rawLesson.title,
    description: rawLesson.description,
    steps
  };
}
