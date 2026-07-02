import {Lesson} from './lesson';

export type CognateCard = {
  english: string;
  spanish: string;
  prompt_say?: string;
  reveal_say?: string;
  stress_hint?: string;
};

export type CognateScript = {
  id: string;
  title: string;
  concept?: string;
  hook: {
    say?: string;
    show_top?: string;
    show_main?: string;
    show_sub?: string;
    show_cta?: string;
  };
  lead_in?: {
    say?: string;
    show_main?: string;
    show_sub?: string;
  };
  cards: CognateCard[];
  outro?: {
    say?: string;
    show_main?: string;
    show_cta?: string;
    show_url?: string;
  };
  caption: string;
  hashtags: string[];
};

export type ScriptLike = CognateScript | Lesson;

export type CarouselTheme = 'editorial-flashcards';

export type CarouselSlide = {
  kind: 'cover' | 'rule' | 'teaching' | 'prompt' | 'reveal' | 'summary';
  eyebrow: string;
  title: string;
  subtitle?: string;
  prompt?: string;
  answer?: string;
  phonetic?: string;
  footer?: string;
};

export type CarouselDeckData = {
  id: string;
  title: string;
  theme: CarouselTheme;
  caption: string;
  hashtags: string[];
  slides: CarouselSlide[];
};

export type CarouselDeckProps = {
  deck: CarouselDeckData;
  slideIndex: number;
};

const compact = (value?: string) => value?.trim().replace(/\n+/g, '\n') || undefined;

const hasCognateShape = (script: ScriptLike): script is CognateScript =>
  'cards' in script && Array.isArray(script.cards);

const numberLabel = (index: number, total: number) =>
  `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

const lineFromLessonSegment = (segment: Lesson['segments'][number]) =>
  compact(segment.display ?? segment.show ?? segment.word ?? segment.say);

function buildCognateSlides(script: CognateScript): CarouselSlide[] {
  const slides: CarouselSlide[] = [
    {
      kind: 'cover',
      eyebrow: compact(script.hook.show_top) ?? 'start here',
      title: compact(script.hook.show_main ?? script.hook.say) ?? script.title,
      subtitle: compact(script.hook.show_sub ?? script.concept),
      footer: compact(script.hook.show_cta) ?? 'swipe slowly',
    },
  ];

  if (script.lead_in) {
    slides.push({
      kind: 'rule',
      eyebrow: 'pattern',
      title: compact(script.lead_in.show_main ?? script.lead_in.say) ?? 'same word.\nnew stress.',
      subtitle: compact(script.lead_in.show_sub ?? script.lead_in.say),
      footer: 'save this pattern',
    });
  }

  script.cards.forEach((card) => {
    slides.push({
      kind: 'prompt',
      eyebrow: 'your turn',
      title: card.english,
      subtitle: compact(card.prompt_say) ?? `How do you say ${card.english}?`,
      prompt: 'say it out loud',
      footer: 'answer on next slide',
    });
    slides.push({
      kind: 'reveal',
      eyebrow: 'answer',
      title: card.spanish,
      subtitle: card.english,
      answer: card.spanish,
      phonetic: compact(card.stress_hint),
      footer: 'repeat it once',
    });
  });

  if (script.outro) {
    slides.push({
      kind: 'summary',
      eyebrow: 'keep going',
      title: compact(script.outro.show_main ?? script.outro.say) ?? 'Hundreds more\nyou already know',
      subtitle: compact(script.outro.say),
      footer: compact(script.outro.show_cta) ?? 'follow for the free course',
    });
  }

  return slides;
}

function buildLessonSlides(script: Lesson): CarouselSlide[] {
  const slides: CarouselSlide[] = [];
  const firstLine = script.segments.find((segment) => segment.kind === 'line');

  slides.push({
    kind: 'cover',
    eyebrow: 'micro lesson',
    title: lineFromLessonSegment(firstLine ?? script.segments[0]) ?? script.title,
    subtitle: script.title,
    footer: 'swipe to practice',
  });

  for (let i = 0; i < script.segments.length; i++) {
    const segment = script.segments[i];
    if (segment === firstLine) continue;

    if (segment.kind === 'line' || segment.kind === 'vowels') {
      slides.push({
        kind: segment.kind === 'vowels' ? 'rule' : 'teaching',
        eyebrow: segment.kind === 'vowels' ? 'vowels' : 'idea',
        title:
          segment.kind === 'vowels'
            ? 'a  e  i  o  u'
            : lineFromLessonSegment(segment) ?? 'watch the pattern',
        subtitle: segment.kind === 'vowels' ? 'ah  eh  ee  oh  oo' : compact(segment.say),
        footer: 'carry this forward',
      });
      continue;
    }

    if (segment.kind === 'prompt') {
      slides.push({
        kind: 'prompt',
        eyebrow: 'your turn',
        title: compact(segment.word ?? segment.display ?? segment.show) ?? 'say it in Spanish',
        subtitle: compact(segment.say),
        prompt: 'answer before swiping',
        footer: 'answer on next slide',
      });
      continue;
    }

    if (segment.kind === 'reveal') {
      slides.push({
        kind: 'reveal',
        eyebrow: 'answer',
        title: compact(segment.word ?? segment.display ?? segment.show) ?? 'listen again',
        subtitle: compact(segment.say),
        answer: compact(segment.word),
        phonetic: compact(segment.phon),
        footer: 'say it twice',
      });
    }
  }

  slides.push({
    kind: 'summary',
    eyebrow: 'save this',
    title: script.title,
    subtitle: compact(script.caption),
    footer: 'follow for the next pattern',
  });

  return slides;
}

export function buildCarouselDeck(script: ScriptLike): CarouselDeckData {
  const slides = hasCognateShape(script) ? buildCognateSlides(script) : buildLessonSlides(script);
  const labeledSlides = slides.map((slide, index) => ({
    ...slide,
    eyebrow: `${slide.eyebrow} / ${numberLabel(index, slides.length)}`,
  }));

  return {
    id: script.id,
    title: script.title,
    theme: 'editorial-flashcards',
    caption: script.caption,
    hashtags: script.hashtags,
    slides: labeledSlides,
  };
}
