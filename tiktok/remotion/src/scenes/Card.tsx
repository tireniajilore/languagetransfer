import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT_DISPLAY, FONT_MONO, GAP, TYPE} from '../theme';
import {script} from '../script';

// Card scenes share one centered face with the lesson clip: a big word, a lime
// SAY IT cue, and a shrinking timer. No kicker, no gloss, no counter — the type
// carries it.
const fadeIn = (frame: number) => interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

const wordStyle: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: TYPE.promptWord,
  color: COLORS.ink,
  letterSpacing: -3,
  textAlign: 'center',
};
const sayItStyle: React.CSSProperties = {
  marginTop: 40,
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 30,
  letterSpacing: 6,
  color: COLORS.accent,
};
const Timer: React.FC<{frac: number}> = ({frac}) => (
  <div style={{marginTop: 30, width: 280, height: 3, background: COLORS.accent, opacity: 0.55, transform: `scaleX(${frac})`}} />
);

// Prompt — the English word + SAY IT (timer full; it counts down in Ring).
export const Prompt: React.FC<{cardIndex: number; speechSec: number}> = ({cardIndex}) => {
  const c = script.cards[cardIndex];
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: fadeIn(frame)}}>
      <div style={wordStyle}>{c.english}</div>
      <div style={sayItStyle}>SAY IT</div>
      <Timer frac={1} />
    </AbsoluteFill>
  );
};

// Ring — same face, the timer shrinks across the silent try-before-reveal beat.
export const Ring: React.FC<{cardIndex: number}> = ({cardIndex}) => {
  const c = script.cards[cardIndex];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frac = Math.max(0, 1 - frame / (GAP * fps));
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={wordStyle}>{c.english}</div>
      <div style={sayItStyle}>SAY IT</div>
      <Timer frac={frac} />
    </AbsoluteFill>
  );
};

// Reveal — the word with its Spanish pronunciation in lime.
export const Reveal: React.FC<{cardIndex: number}> = ({cardIndex}) => {
  const c = script.cards[cardIndex];
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: fadeIn(frame)}}>
      <div style={wordStyle}>{c.spanish}</div>
      {c.stress_hint ? (
        <div style={{marginTop: 30, fontFamily: FONT_MONO, fontWeight: 500, fontSize: 58, letterSpacing: 2, color: COLORS.accent}}>
          {c.stress_hint}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
