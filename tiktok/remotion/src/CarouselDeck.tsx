/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4
 * Hallmark · component: carousel deck · genre: editorial · theme: Newsprint
 * states: static social slides · contrast: pass
 */
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {loadFont as loadDisplay} from '@remotion/google-fonts/Newsreader';
import {loadFont as loadBody} from '@remotion/google-fonts/PublicSans';
import {loadFont as loadMono} from '@remotion/google-fonts/GeistMono';
import {CarouselDeckProps, CarouselSlide} from './carousel';

const {fontFamily: displayFamily} = loadDisplay('normal', {
  weights: ['500', '700'],
  subsets: ['latin'],
});
const {fontFamily: bodyFamily} = loadBody('normal', {
  weights: ['400', '500', '700'],
  subsets: ['latin'],
});
const {fontFamily: monoFamily} = loadMono('normal', {
  weights: ['400', '500'],
  subsets: ['latin'],
});

const TOKENS = {
  colorPaper: 'oklch(96% 0.025 89)',
  colorPaperLift: 'oklch(91% 0.035 88)',
  colorInk: 'oklch(19% 0.045 73)',
  colorMuted: 'oklch(45% 0.035 78)',
  colorRule: 'oklch(73% 0.045 82)',
  colorAccent: 'oklch(51% 0.155 28)',
  colorAccentSoft: 'oklch(87% 0.085 47)',
  fontDisplay: displayFamily,
  fontBody: bodyFamily,
  fontMono: monoFamily,
  spaceInset: 84,
  ruleThin: 2,
};

const WIDTH = 1080;
const HEIGHT = 1920;
const SAFE_WIDTH = WIDTH - TOKENS.spaceInset * 2;

const clean = (text?: string) => text?.trim() ?? '';

const longestWord = (text: string) =>
  Math.max(...text.split(/\s+/).map((word) => word.length), 0);

const titleSize = (slide: CarouselSlide) => {
  const text = clean(slide.title);
  const longest = longestWord(text);
  if (slide.kind === 'cover') {
    if (text.length > 58 || longest > 16) return 112;
    if (text.length > 38 || longest > 12) return 132;
    return 154;
  }
  if (slide.kind === 'reveal') {
    if (text.length > 38 || longest > 14) return 112;
    if (text.length > 24) return 132;
    return 152;
  }
  if (text.length > 58 || longest > 16) return 82;
  if (text.length > 38 || longest > 13) return 98;
  return 122;
};

const subtitleSize = (text?: string) => {
  const value = clean(text);
  if (value.length > 130) return 34;
  if (value.length > 80) return 40;
  return 46;
};

const titleStyle = (slide: CarouselSlide): React.CSSProperties => ({
  fontFamily: TOKENS.fontDisplay,
  fontWeight: slide.kind === 'reveal' ? 700 : 500,
  fontSize: titleSize(slide),
  lineHeight: 0.96,
  letterSpacing: 0,
  color: slide.kind === 'reveal' ? TOKENS.colorAccent : TOKENS.colorInk,
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
  maxWidth: SAFE_WIDTH,
});

const eyebrowStyle: React.CSSProperties = {
  fontFamily: TOKENS.fontMono,
  fontSize: 26,
  lineHeight: 1.2,
  letterSpacing: 0,
  color: TOKENS.colorMuted,
  textTransform: 'uppercase',
};

const bodyStyle = (size: number): React.CSSProperties => ({
  fontFamily: TOKENS.fontBody,
  fontWeight: 500,
  fontSize: size,
  lineHeight: 1.18,
  letterSpacing: 0,
  color: TOKENS.colorInk,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-line',
});

const DeckBackground: React.FC = () => (
  <AbsoluteFill style={{background: TOKENS.colorPaper}}>
    <div
      style={{
        position: 'absolute',
        inset: 34,
        border: `${TOKENS.ruleThin}px solid ${TOKENS.colorRule}`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 34,
        height: HEIGHT,
        background: TOKENS.colorAccentSoft,
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: 144,
        right: 34,
        width: 2,
        height: HEIGHT - 288,
        background: TOKENS.colorRule,
      }}
    />
  </AbsoluteFill>
);

const Footer: React.FC<{deckTitle: string; footer?: string}> = ({deckTitle, footer}) => (
  <div
    style={{
      position: 'absolute',
      left: TOKENS.spaceInset,
      right: TOKENS.spaceInset,
      bottom: 76,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
      borderTop: `${TOKENS.ruleThin}px solid ${TOKENS.colorRule}`,
      paddingTop: 28,
      fontFamily: TOKENS.fontMono,
      fontSize: 24,
      lineHeight: 1.2,
      color: TOKENS.colorMuted,
      letterSpacing: 0,
      textTransform: 'uppercase',
    }}
  >
    <span style={{maxWidth: 500, overflowWrap: 'anywhere'}}>{deckTitle}</span>
    <span style={{maxWidth: 360, textAlign: 'right', color: TOKENS.colorAccent}}>
      {footer ?? 'swipe'}
    </span>
  </div>
);

const PromptCue: React.FC<{slide: CarouselSlide}> = ({slide}) => {
  if (!slide.prompt && slide.kind !== 'prompt') return null;
  return (
    <div
      style={{
        marginTop: 46,
        display: 'inline-flex',
        alignItems: 'center',
        borderTop: `${TOKENS.ruleThin}px solid ${TOKENS.colorAccent}`,
        borderBottom: `${TOKENS.ruleThin}px solid ${TOKENS.colorAccent}`,
        padding: '18px 0',
        fontFamily: TOKENS.fontMono,
        fontSize: 30,
        lineHeight: 1.1,
        color: TOKENS.colorAccent,
        letterSpacing: 0,
        textTransform: 'uppercase',
      }}
    >
      {slide.prompt ?? 'answer before swiping'}
    </div>
  );
};

const Phonetic: React.FC<{slide: CarouselSlide}> = ({slide}) => {
  if (!slide.phonetic) return null;
  return (
    <div
      style={{
        marginTop: 38,
        maxWidth: SAFE_WIDTH,
        fontFamily: TOKENS.fontMono,
        fontWeight: 500,
        fontSize: slide.phonetic.length > 32 ? 40 : 52,
        lineHeight: 1.16,
        letterSpacing: 0,
        color: TOKENS.colorMuted,
        overflowWrap: 'anywhere',
      }}
    >
      {slide.phonetic}
    </div>
  );
};

const SlideBody: React.FC<{slide: CarouselSlide}> = ({slide}) => {
  const isCover = slide.kind === 'cover';
  const subtitle = clean(slide.subtitle);

  return (
    <div
      style={{
        position: 'absolute',
        left: TOKENS.spaceInset,
        right: TOKENS.spaceInset,
        top: isCover ? 262 : 284,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      <div style={eyebrowStyle}>{slide.eyebrow}</div>
      <div
        style={{
          width: isCover ? 520 : 420,
          height: TOKENS.ruleThin,
          background: TOKENS.colorAccent,
          marginTop: 30,
          marginBottom: isCover ? 86 : 72,
        }}
      />
      <div style={titleStyle(slide)}>{slide.title}</div>
      {subtitle ? (
        <div
          style={{
            ...bodyStyle(subtitleSize(subtitle)),
            marginTop: slide.kind === 'reveal' ? 34 : 46,
            maxWidth: slide.kind === 'cover' ? 790 : 820,
            color: slide.kind === 'reveal' ? TOKENS.colorInk : TOKENS.colorMuted,
          }}
        >
          {subtitle}
        </div>
      ) : null}
      <PromptCue slide={slide} />
      <Phonetic slide={slide} />
    </div>
  );
};

export const CarouselDeck: React.FC<CarouselDeckProps> = ({deck, slideIndex}) => {
  const slide = deck.slides[Math.min(Math.max(slideIndex, 0), deck.slides.length - 1)];

  return (
    <AbsoluteFill>
      <DeckBackground />
      <SlideBody slide={slide} />
      <Footer deckTitle={deck.title} footer={slide.footer} />
    </AbsoluteFill>
  );
};

