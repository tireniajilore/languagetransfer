import {
  COGNATES_COURSE,
  COGNATES_SCRIPT_BY_ID,
  type CognatesCourseLesson,
  type CognatesScriptId
} from '@/data/cognates/course';
import type { Lesson, LessonStep, SpeechSegment, WaitDuration } from '@/types/lesson';

type SegmentKind = 'line' | 'prompt' | 'reveal' | 'vowels';
type SegmentLang = 'en' | 'es';

interface TikTokLessonSegment {
  kind: SegmentKind;
  lang: SegmentLang;
  say: string;
  show?: string;
  word?: string;
  phon?: string;
}

interface TikTokLessonScript {
  id: string;
  title: string;
  segments: TikTokLessonSegment[];
  caption?: string;
  hashtags?: string[];
}

interface TikTokSeedCognatesCard {
  english: string;
  spanish: string;
  prompt_say: string;
  reveal_say: string;
  stress_hint?: string;
}

interface TikTokSeedCognatesScript {
  id: string;
  title: string;
  hook: {
    say: string;
    lang: SegmentLang;
    show_main?: string;
    show_sub?: string;
  };
  lead_in: {
    say: string;
    lang: SegmentLang;
    show_main?: string;
    show_sub?: string;
  };
  cards: TikTokSeedCognatesCard[];
  outro: {
    say: string;
    lang: SegmentLang;
    show_main?: string;
  };
  caption?: string;
  hashtags?: string[];
}

export interface CognatesCourseSummaryLesson {
  id: string;
  number: number;
  title: string;
  promise: string;
  estimatedMinutes: number;
  sectionCount: number;
  promptCount: number;
}

export interface CognatesCourseSummary {
  id: string;
  title: string;
  description: string;
  version: string;
  lessons: CognatesCourseSummaryLesson[];
}

export interface CognatesLessonBundle {
  course: typeof COGNATES_COURSE;
  courseLesson: CognatesCourseLesson;
  lesson: Lesson;
  sectionStepRanges: Array<{
    sectionId: string;
    sourceScriptId: string;
    title: string;
    startIndex: number;
    endIndex: number;
    promptCount: number;
  }>;
}

export class CognatesContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CognatesContentValidationError';
  }
}

const VALID_SEGMENT_KINDS = new Set<SegmentKind>(['line', 'prompt', 'reveal', 'vowels']);
const VALID_LANGS = new Set<SegmentLang>(['en', 'es']);

function estimateDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.min(12, Math.round(words / 2.9)));
}

function waitDurationForPrompt(text: string): WaitDuration {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 4) return 'short';
  if (words <= 10) return 'medium';
  return 'long';
}

function normalizeCaption(segment: TikTokLessonSegment) {
  if (segment.kind === 'reveal') {
    return segment.word ?? segment.show ?? segment.say;
  }

  if (segment.kind === 'prompt') {
    return segment.word ?? segment.show ?? segment.say;
  }

  return segment.show ?? segment.word ?? segment.say;
}

function buildSegments(segment: TikTokLessonSegment): SpeechSegment[] {
  return [{
    text: getSegmentSpeechText(segment),
    lang: segment.lang
  }];
}

function acceptedAnswersForPrompt(script: TikTokLessonScript, index: number) {
  const nextReveal = script.segments.slice(index + 1).find((segment) => segment.kind === 'reveal');
  const answer = nextReveal?.word ?? nextReveal?.say;

  if (!answer) return undefined;

  const normalized = answer.replace(/\.$/, '').trim();
  return Array.from(new Set([answer.trim(), normalized].filter(Boolean)));
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CognatesContentValidationError(`${label} must be a non-empty string.`);
  }
}

function getSegmentSpeechText(segment: TikTokLessonSegment) {
  if (segment.say?.trim()) return segment.say;
  if (segment.kind === 'prompt' && segment.word?.trim()) return `Say: ${segment.word}`;
  return '';
}

function parseScript(rawScript: unknown, expectedId: string): TikTokLessonScript {
  if (!rawScript || typeof rawScript !== 'object') {
    throw new CognatesContentValidationError(`${expectedId} is not an object.`);
  }

  const script = rawScript as Partial<TikTokLessonScript>;
  assertNonEmptyString(script.id, `${expectedId}.id`);
  assertNonEmptyString(script.title, `${expectedId}.title`);

  if (script.id !== expectedId) {
    throw new CognatesContentValidationError(`${expectedId} imported script id ${script.id}.`);
  }

  if (!Array.isArray(script.segments)) {
    if (expectedId === 'spanish-cognates-01') {
      return normalizeSeedCognatesScript(rawScript, expectedId);
    }

    throw new CognatesContentValidationError(`${expectedId}.segments must be a non-empty array.`);
  }

  if (script.segments.length === 0) {
    throw new CognatesContentValidationError(`${expectedId}.segments must be a non-empty array.`);
  }

  const segments = script.segments.map((segment, index) => {
    if (!segment || typeof segment !== 'object') {
      throw new CognatesContentValidationError(`${expectedId}.segments[${index}] must be an object.`);
    }

    const candidate = segment as Partial<TikTokLessonSegment>;

    if (!VALID_SEGMENT_KINDS.has(candidate.kind as SegmentKind)) {
      throw new CognatesContentValidationError(`${expectedId}.segments[${index}].kind is invalid.`);
    }
    if (!VALID_LANGS.has(candidate.lang as SegmentLang)) {
      throw new CognatesContentValidationError(`${expectedId}.segments[${index}].lang is invalid.`);
    }
    if (candidate.kind === 'prompt') {
      if (!candidate.say?.trim() && !candidate.word?.trim()) {
        throw new CognatesContentValidationError(`${expectedId}.segments[${index}] prompt needs say or word.`);
      }
    } else {
      assertNonEmptyString(candidate.say, `${expectedId}.segments[${index}].say`);
    }

    return {
      kind: candidate.kind as SegmentKind,
      lang: candidate.lang as SegmentLang,
      say: candidate.say ?? '',
      show: candidate.show,
      word: candidate.word,
      phon: candidate.phon
    };
  });

  const promptCount = segments.filter((segment) => segment.kind === 'prompt').length;
  const revealCount = segments.filter((segment) => segment.kind === 'reveal').length;

  if (promptCount === 0) {
    throw new CognatesContentValidationError(`${expectedId} must include at least one prompt.`);
  }
  if (revealCount === 0) {
    throw new CognatesContentValidationError(`${expectedId} must include at least one reveal.`);
  }
  if (revealCount < promptCount) {
    throw new CognatesContentValidationError(`${expectedId} has fewer reveals than prompts.`);
  }

  return {
    id: script.id,
    title: script.title,
    segments,
    caption: script.caption,
    hashtags: script.hashtags
  };
}

function normalizeSeedCognatesScript(rawScript: unknown, expectedId: string): TikTokLessonScript {
  const script = rawScript as Partial<TikTokSeedCognatesScript>;

  if (!script.hook || !script.lead_in || !script.outro || !Array.isArray(script.cards)) {
    throw new CognatesContentValidationError(`${expectedId} must include hook, lead_in, cards, and outro.`);
  }

  assertNonEmptyString(script.hook.say, `${expectedId}.hook.say`);
  assertNonEmptyString(script.lead_in.say, `${expectedId}.lead_in.say`);
  assertNonEmptyString(script.outro.say, `${expectedId}.outro.say`);

  if (script.cards.length === 0) {
    throw new CognatesContentValidationError(`${expectedId}.cards must be a non-empty array.`);
  }

  const cardSegments = script.cards.flatMap((card, index): TikTokLessonSegment[] => {
    assertNonEmptyString(card.english, `${expectedId}.cards[${index}].english`);
    assertNonEmptyString(card.spanish, `${expectedId}.cards[${index}].spanish`);
    assertNonEmptyString(card.prompt_say, `${expectedId}.cards[${index}].prompt_say`);
    assertNonEmptyString(card.reveal_say, `${expectedId}.cards[${index}].reveal_say`);

    return [
      {
        kind: 'prompt',
        lang: 'en',
        say: card.prompt_say,
        word: card.english
      },
      {
        kind: 'reveal',
        lang: 'es',
        say: card.reveal_say,
        word: card.spanish,
        phon: card.stress_hint
      }
    ];
  });

  return {
    id: expectedId,
    title: script.title ?? 'You already speak Spanish',
    caption: script.caption,
    hashtags: script.hashtags,
    segments: [
      {
        kind: 'line',
        lang: script.hook.lang ?? 'en',
        say: script.hook.say,
        show: [script.hook.show_main, script.hook.show_sub].filter(Boolean).join('\n') || undefined
      },
      {
        kind: 'line',
        lang: script.lead_in.lang ?? 'en',
        say: script.lead_in.say,
        show: [script.lead_in.show_main, script.lead_in.show_sub].filter(Boolean).join('\n') || undefined
      },
      ...cardSegments,
      {
        kind: 'line',
        lang: script.outro.lang ?? 'en',
        say: script.outro.say,
        show: script.outro.show_main
      }
    ]
  };
}

function getScript(sourceScriptId: string) {
  const script = COGNATES_SCRIPT_BY_ID[sourceScriptId as CognatesScriptId];

  if (!script) {
    throw new CognatesContentValidationError(`Course references missing script ${sourceScriptId}.`);
  }

  return parseScript(script, sourceScriptId);
}

function getStepType(kind: SegmentKind): LessonStep['type'] {
  if (kind === 'prompt') return 'prompt';
  if (kind === 'reveal') return 'reveal';
  return 'narration';
}

function scriptSegmentToStep({
  courseLesson,
  sectionId,
  sectionTitle,
  script,
  segment,
  index
}: {
  courseLesson: CognatesCourseLesson;
  sectionId: string;
  sectionTitle: string;
  script: TikTokLessonScript;
  segment: TikTokLessonSegment;
  index: number;
}): LessonStep {
  const type = getStepType(segment.kind);
  const stepId = `${courseLesson.id}-${sectionId}-${index + 1}-${segment.kind}`;

  return {
    id: stepId,
    type,
    text: getSegmentSpeechText(segment),
    caption: normalizeCaption(segment),
    sourceKey: `${script.id}-segment-${index + 1}`,
    segments: buildSegments(segment),
    estimatedDuration: estimateDuration(getSegmentSpeechText(segment)),
    expectsResponse: type === 'prompt' ? true : undefined,
    acceptedAnswers: type === 'prompt' ? acceptedAnswersForPrompt(script, index) : undefined,
    waitDuration: type === 'prompt' ? waitDurationForPrompt(segment.say) : undefined,
    metadata: {
      courseLessonId: courseLesson.id,
      sectionId,
      sourceScriptId: script.id,
      sourceSegmentIndex: index,
      phoneticHint: segment.phon,
      sectionTitle
    }
  };
}

function buildLessonDescription(courseLesson: CognatesCourseLesson) {
  return `${courseLesson.promise} ${courseLesson.sections.length} sections, about ${courseLesson.estimatedMinutes} minutes.`;
}

export function getCognatesCourseSummary(): CognatesCourseSummary {
  return {
    id: COGNATES_COURSE.id,
    title: COGNATES_COURSE.title,
    description: COGNATES_COURSE.description,
    version: COGNATES_COURSE.version,
    lessons: COGNATES_COURSE.lessons.map((courseLesson) => {
      const promptCount = courseLesson.sections.reduce((total, section) => {
        const script = getScript(section.sourceScriptId);
        return total + script.segments.filter((segment) => segment.kind === 'prompt').length;
      }, 0);

      return {
        id: courseLesson.id,
        number: courseLesson.number,
        title: courseLesson.title,
        promise: courseLesson.promise,
        estimatedMinutes: courseLesson.estimatedMinutes,
        sectionCount: courseLesson.sections.length,
        promptCount
      };
    })
  };
}

export function getCognatesLessonBundle(lessonId: string): CognatesLessonBundle | null {
  const courseLesson = COGNATES_COURSE.lessons.find((candidate) => candidate.id === lessonId);
  if (!courseLesson) return null;

  const steps: LessonStep[] = [];
  const sectionStepRanges: CognatesLessonBundle['sectionStepRanges'] = [];

  courseLesson.sections.forEach((section) => {
    const script = getScript(section.sourceScriptId);
    const startIndex = steps.length;
    const sectionSteps = script.segments.map((segment, index) => scriptSegmentToStep({
      courseLesson,
      sectionId: section.id,
      sectionTitle: script.title,
      script,
      segment,
      index
    }));

    steps.push(...sectionSteps);

    sectionStepRanges.push({
      sectionId: section.id,
      sourceScriptId: script.id,
      title: script.title,
      startIndex,
      endIndex: steps.length - 1,
      promptCount: sectionSteps.filter((step) => step.type === 'prompt').length
    });
  });

  return {
    course: COGNATES_COURSE,
    courseLesson,
    lesson: {
      id: `cognates-${courseLesson.id}`,
      title: courseLesson.title,
      description: buildLessonDescription(courseLesson),
      steps
    },
    sectionStepRanges
  };
}

export function getCognatesLessonIds() {
  return COGNATES_COURSE.lessons.map((lesson) => lesson.id);
}

export function validateCognatesCourse() {
  const seenLessonIds = new Set<string>();
  const seenSectionIds = new Set<string>();

  COGNATES_COURSE.lessons.forEach((lesson) => {
    if (seenLessonIds.has(lesson.id)) {
      throw new CognatesContentValidationError(`Duplicate course lesson id ${lesson.id}.`);
    }
    seenLessonIds.add(lesson.id);

    if (lesson.sections.length === 0) {
      throw new CognatesContentValidationError(`${lesson.id} must include at least one section.`);
    }

    lesson.sections.forEach((section) => {
      const scopedSectionId = `${lesson.id}/${section.id}`;
      if (seenSectionIds.has(scopedSectionId)) {
        throw new CognatesContentValidationError(`Duplicate section id ${scopedSectionId}.`);
      }
      seenSectionIds.add(scopedSectionId);
      getScript(section.sourceScriptId);
    });
  });

  return getCognatesCourseSummary();
}
