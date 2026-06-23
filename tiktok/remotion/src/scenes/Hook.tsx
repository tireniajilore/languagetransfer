import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONT_DISPLAY, TYPE} from '../theme';
import {script} from '../script';

// Loop anchor (frame 0 == the loop bridge's last frame). Built to hit hard at
// frame 0: the headline is full-strength and dominant immediately (no fade), and
// the spoken line is NOT duplicated as a caption here — the big text IS the line.
// So the scroll-stop frame is one punch, not three stacked text blocks. The CTA
// is the only thing that fades in, after the headline has already landed.
export const Hook: React.FC<{speechSec: number}> = () => {
  const frame = useCurrentFrame();
  const ctaOpacity = interpolate(frame, [12, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const big: React.CSSProperties = {
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: TYPE.hookHeadline,
    letterSpacing: -4,
    textAlign: 'center',
    lineHeight: 1.02,
    margin: 0,
  };
  const h = script.hook;
  const mainWords = h.show_main.trim().split(/\s+/);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: 600, width: '100%'}}>
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
          top: 900,
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
      <div
        style={{
          position: 'absolute',
          top: 1480,
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
