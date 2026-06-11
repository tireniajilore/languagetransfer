import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT_DISPLAY, FONT_MONO, GAP, TYPE} from '../theme';
import {Karaoke} from '../components/Karaoke';
import {script} from '../script';

// Every beat puts the big word in the SAME slot — English in the prompt/ring
// beats, Spanish in the reveal. Sharing the slot is the whole idea: across the
// cut the English word dissolves and the Spanish resolves in place, so you see
// it's the same word. No card, no border, no ring — type on the bloomed canvas.
const WORD_TOP = 770;

const wordBase: React.CSSProperties = {
  position: 'absolute',
  top: WORD_TOP,
  width: '100%',
  textAlign: 'center',
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: TYPE.promptWord,
  letterSpacing: -3,
  lineHeight: 1,
  margin: 0,
};

const Kicker: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: WORD_TOP - 78,
      width: '100%',
      textAlign: 'center',
      fontFamily: FONT_DISPLAY,
      fontWeight: 500,
      fontSize: 30,
      letterSpacing: 6,
      color: COLORS.muted,
    }}
  >
    HOW DO YOU SAY
  </div>
);

// English word — fades up, lavender-white.
export const Prompt: React.FC<{cardIndex: number; speechSec: number}> = ({cardIndex, speechSec}) => {
  const c = script.cards[cardIndex];
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: o}}>
      <Kicker />
      <div style={{...wordBase, color: COLORS.ink}}>{c.english}</div>
      <Karaoke text={c.prompt_say} speechSec={speechSec} top={1180} />
    </AbsoluteFill>
  );
};

// "Your turn" beat — English holds, a calm lime line shrinks beneath it as a
// quiet timer (transform only, no spin). The lower bloom swells from CognateClip.
export const Ring: React.FC<{cardIndex: number}> = ({cardIndex}) => {
  const c = script.cards[cardIndex];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frac = Math.max(0, 1 - frame / (GAP * fps)); // 1 -> 0 over the beat
  return (
    <AbsoluteFill>
      <Kicker />
      <div style={{...wordBase, color: COLORS.ink}}>{c.english}</div>
      <div
        style={{
          position: 'absolute',
          top: WORD_TOP + 170,
          width: '100%',
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: 6,
          color: COLORS.accent,
        }}
      >
        SAY IT
      </div>
      <div style={{position: 'absolute', top: WORD_TOP + 240, width: '100%', display: 'flex', justifyContent: 'center'}}>
        <div style={{width: 280, height: 3, background: COLORS.accent, opacity: 0.55, transform: `scaleX(${frac})`}} />
      </div>
    </AbsoluteFill>
  );
};

// Phonetic respelling — the stressed (UPPERCASE) syllable is ticked bright white
// against the muted mono. The Spanish word itself carries the lime, so the
// stress marker is white to stay distinct.
const Phonetic: React.FC<{hint: string}> = ({hint}) => {
  const parts = hint.split('-');
  return (
    <div
      style={{
        position: 'absolute',
        top: WORD_TOP + 155,
        width: '100%',
        textAlign: 'center',
        fontFamily: FONT_MONO,
        fontSize: TYPE.hint,
        letterSpacing: 2,
      }}
    >
      {parts.map((p, i) => {
        const stressed = p === p.toUpperCase() && /[A-Z]/.test(p);
        return (
          <span key={i} style={{color: stressed ? COLORS.ink : COLORS.muted, fontWeight: stressed ? 500 : 400}}>
            {p}
            {i < parts.length - 1 ? '-' : ''}
          </span>
        );
      })}
    </div>
  );
};

// Spanish resolves in the same slot, in luminous lime — a cross-dissolve in place.
export const Reveal: React.FC<{cardIndex: number}> = ({cardIndex}) => {
  const c = script.cards[cardIndex];
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: o}}>
      <div style={{...wordBase, color: COLORS.accent}}>{c.spanish}</div>
      {c.stress_hint ? <Phonetic hint={c.stress_hint} /> : null}
      <div
        style={{
          position: 'absolute',
          top: WORD_TOP + 235,
          width: '100%',
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: 400,
          fontSize: TYPE.howDoYouSay,
          color: COLORS.muted,
        }}
      >
        same word — «{c.english}»
      </div>
    </AbsoluteFill>
  );
};
