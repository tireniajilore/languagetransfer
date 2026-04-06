export type StepType = 'narration' | 'prompt' | 'open_prompt' | 'reveal' | 'instruction' | 'pause';

export type WaitDuration = 'short' | 'medium' | 'long' | 'extended';

export interface SpeechSegment {
  text: string;
  lang: 'en' | 'es';
}

export interface LessonStep {
  id: string;
  type: StepType;
  text: string;
  segments?: SpeechSegment[];
  sourceKey?: string;
  estimatedDuration?: number;
  expectsResponse?: boolean;
  acceptedAnswers?: string[];
  waitDuration?: WaitDuration;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  steps: LessonStep[];
}

export interface RawLessonTurn {
  speaker: 'tutor' | 'student';
  text?: string;
  is_prompt?: boolean;
  is_feedback?: boolean;
  expected_answers?: string[];
}

export interface RawLesson {
  lesson_number: number;
  title: string;
  description: string;
  turns: RawLessonTurn[];
  outro?: Array<{
    type: 'narration' | 'open_prompt';
    text: string;
    waitDuration?: WaitDuration;
  }>;
}
