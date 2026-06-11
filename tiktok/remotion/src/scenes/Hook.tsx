import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONT_DISPLAY, TYPE} from '../theme';
import {Karaoke} from '../components/Karaoke';
import {script} from '../script';

// Loop anchor: frame 0 must match the loop-bridge's final frame, but later
// frames can still animate (Freeze captures whatever frame 0 looks like). Fade
// only — no slide. The punch line's last word carries the single lime accent.
export const Hook: React.FC<{speechSec: number}> = ({speechSec}) => {
  const frame = useCurrentFrame();
  const ctaOpacity = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const big: React.CSSProperties = {
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: TYPE.hookHeadline,
    letterSpacing: -3,
    textAlign: 'center',
    lineHeight: 1.05,
    margin: 0,
  };
  const h = script.hook;
  const mainWords = h.show_main.trim().split(/\s+/);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: 640, width: '100%'}}>
        <p style={{...big, color: COLORS.ink}}>{h.show_top}</p>
        <p style={{...big, color: COLORS.ink}}>
          {mainWords.map((w, i) => (
            <span key={i} style={{color: i === mainWords.length - 1 ? COLORS.accent : COLORS.ink}}>
              {w}
              {i < mainWords.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 920,
          width: '100%',
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: 400,
          fontSize: TYPE.howDoYouSay,
          color: COLORS.muted,
        }}
      >
        {h.show_sub}
      </div>
      <Karaoke text={h.say} speechSec={speechSec} top={1180} />
      <div
        style={{
          position: 'absolute',
          top: 1500,
          width: '100%',
          textAlign: 'center',
          opacity: ctaOpacity,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: TYPE.cta,
            color: COLORS.bg,
            background: COLORS.accent,
            borderRadius: 9999,
            padding: '20px 48px',
          }}
        >
          {h.show_cta}
        </span>
      </div>
    </AbsoluteFill>
  );
};
