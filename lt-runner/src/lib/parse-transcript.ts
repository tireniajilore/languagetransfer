import type { Lesson, LessonStep, RawLesson, RawLessonTurn, SpeechSegment, WaitDuration } from '@/types/lesson';

export const QUESTION_START_PATTERNS = [
  /\bSo how would you\b/i,
  /\bHow would you\b/i,
  /\bHow do you think\b/i,
  /\bIf you want to say\b/i,
  /\bWhat if you want to say\b/i,
  /\bWhat was\b/i,
  /\bSo what was\b/i,
  /\bCan you say\b/i
];

const WAIT_BY_TEXT: Record<WaitDuration, number> = {
  short: 8,
  medium: 12,
  long: 20,
  extended: 30
};

type StepPart = 'full' | 'prompt' | 'reveal';

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

export interface FeedbackPromptSplit {
  revealText: string;
  promptText: string;
  splitIndex: number;
}

export function splitFeedbackPromptText(text: string): FeedbackPromptSplit {
  const explicitPattern = QUESTION_START_PATTERNS
    .map((pattern) => ({ index: text.search(pattern), pattern }))
    .filter((match) => match.index > 0)
    .sort((a, b) => a.index - b.index)[0];

  if (explicitPattern) {
    const candidatePrompt = text.slice(explicitPattern.index).trim();
    const isGenuinePrompt = candidatePrompt.includes('?') || candidatePrompt.length <= 120;

    if (isGenuinePrompt) {
      return {
        revealText: text.slice(0, explicitPattern.index).trim(),
        promptText: candidatePrompt,
        splitIndex: explicitPattern.index
      };
    }
  }

  const explicitColonPrompt = text.match(/^(.*?)([A-Z"'(][^.!?]{1,120}:\s*)$/);
  if (explicitColonPrompt && explicitColonPrompt[1].trim()) {
    const splitIndex = text.length - explicitColonPrompt[2].length;
    return {
      revealText: explicitColonPrompt[1].trim(),
      promptText: explicitColonPrompt[2].trim(),
      splitIndex
    };
  }

  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (sentences.length > 1) {
    const lastSentence = sentences[sentences.length - 1];

    if (lastSentence.endsWith('?')) {
      const splitIndex = text.lastIndexOf(lastSentence);
      return {
        revealText: sentences.slice(0, -1).join(' ').trim(),
        promptText: lastSentence,
        splitIndex
      };
    }

    if (text.length > 150 && lastSentence.length <= 80) {
      const splitIndex = text.lastIndexOf(lastSentence);
      return {
        revealText: sentences.slice(0, -1).join(' ').trim(),
        promptText: lastSentence,
        splitIndex
      };
    }
  }

  return {
    revealText: '',
    promptText: text.trim(),
    splitIndex: 0
  };
}

function cleanPromptText(text: string) {
  const trimmed = text.trim();
  const withoutTrailingColonCue = trimmed.replace(
    /^(.+\?)\s+[A-ZÁÉÍÓÚÑÜ][^?!]{1,80}:\s*$/,
    '$1'
  );

  const withoutLeadingAnswer = withoutTrailingColonCue.replace(
    /^([A-ZÁÉÍÓÚÑÜ][^.!?]{0,80}[.!?])\s+([A-Z"'(].+)$/,
    '$2'
  );

  return withoutLeadingAnswer
    .replace(/^(?:Good|Perfect|Very good|Yeah)[,.\s]+/i, '')
    .replace(/^So[,:\s]+/i, '')
    .trim()
    .replace(/^how\b/, 'How')
    .replace(/^if\b/, 'If');
}

function cleanRevealText(text: string) {
  const trimmed = text.trim();
  if (/^(?:Good|Perfect|Very good|Yeah)[,.\s]*$/i.test(trimmed)) {
    return '';
  }

  return trimmed;
}

function buildSourceKey(turnIndex: number, part: StepPart) {
  return `turn-${turnIndex + 1}-${part}`;
}

function buildOutroSourceKey(outroIndex: number) {
  return `outro-${outroIndex + 1}-full`;
}

function applySegments(
  segmentOverrides: Record<string, SpeechSegment[]>,
  sourceKey: string,
  step: Omit<LessonStep, 'estimatedDuration'> & { estimatedDuration?: number }
): LessonStep {
  const segments = segmentOverrides[sourceKey];

  return {
    ...step,
    sourceKey,
    segments,
    estimatedDuration: step.estimatedDuration ?? (step.text ? estimateDuration(step.text) : 2)
  };
}

function buildPromptStep(
  segmentOverrides: Record<string, SpeechSegment[]>,
  turn: RawLessonTurn,
  turnIndex: number,
  id: string,
  acceptedAnswers?: string[]
): LessonStep {
  return applySegments(segmentOverrides, buildSourceKey(turnIndex, 'full'), {
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

export function convertRawLessonToLesson(
  rawLesson: RawLesson,
  segmentOverrides: Record<string, SpeechSegment[]> = {}
): Lesson {
  const steps: LessonStep[] = [];

  rawLesson.turns.forEach((turn, index, turns) => {
    if (turn.speaker !== 'tutor') return;

    const nextTurn = turns[index + 1];
    const acceptedAnswers = nextTurn?.speaker === 'student' ? nextTurn.expected_answers : undefined;
    const baseId = `step-${steps.length + 1}`;

    if (turn.is_feedback && turn.is_prompt) {
      const { revealText, promptText } = splitFeedbackPromptText(turn.text ?? '');
      const cleanedRevealText = cleanRevealText(revealText);
      const cleanedPromptText = cleanPromptText(promptText || turn.text || '');

      if (cleanedRevealText) {
        steps.push(
          applySegments(segmentOverrides, buildSourceKey(index, 'reveal'), {
            id: `${baseId}-reveal`,
            type: 'reveal',
            text: cleanedRevealText
          })
        );
      }

      steps.push(
        applySegments(segmentOverrides, buildSourceKey(index, 'prompt'), {
          id: `${baseId}-prompt`,
          type: 'prompt',
          text: cleanedPromptText,
          expectsResponse: true,
          acceptedAnswers,
          waitDuration: inferWaitDuration(cleanedPromptText)
        })
      );
      return;
    }

    if (turn.is_prompt) {
      steps.push(buildPromptStep(segmentOverrides, turn, index, baseId, acceptedAnswers));
      return;
    }

    if (turn.is_feedback) {
      steps.push(
        applySegments(segmentOverrides, buildSourceKey(index, 'full'), {
          id: baseId,
          type: 'reveal',
          text: turn.text ?? ''
        })
      );
      return;
    }

    steps.push(
      applySegments(segmentOverrides, buildSourceKey(index, 'full'), {
        id: baseId,
        type: 'narration',
        text: turn.text ?? ''
      })
    );
  });

  rawLesson.outro?.forEach((entry, index) => {
    steps.push(applySegments(segmentOverrides, buildOutroSourceKey(index), {
      id: `outro-${index + 1}`,
      type: entry.type,
      text: entry.text,
      waitDuration: entry.waitDuration,
      expectsResponse: entry.type === 'open_prompt' ? false : undefined,
      estimatedDuration: estimateDuration(entry.text)
    }));
  });

  return {
    id: `lesson-${rawLesson.lesson_number.toString().padStart(2, '0')}`,
    title: rawLesson.title,
    description: rawLesson.description,
    steps
  };
}
