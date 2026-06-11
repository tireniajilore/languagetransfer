import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONT_DISPLAY, TYPE} from '../theme';
import {Karaoke} from '../components/Karaoke';
import {script} from '../script';

export const Outro: React.FC<{speechSec: number}> = ({speechSec}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  const out = script.outro;
  const big: React.CSSProperties = {
    fontFamily: FONT_DISPLAY,
    fontWeight: 500,
    fontSize: TYPE.leadLine,
    letterSpacing: -2,
    textAlign: 'center',
    lineHeight: 1.12,
    margin: 0,
    color: COLORS.ink,
  };
  return (
    <AbsoluteFill style={{opacity: o}}>
      <div style={{position: 'absolute', top: 640, width: '100%'}}>
        {out.show_main.split('\n').map((ln, i) => (
          <p key={i} style={big}>
            {ln}
          </p>
        ))}
      </div>
      <Karaoke text={out.say} speechSec={speechSec} top={900} />
      <div style={{position: 'absolute', top: 1240, width: '100%', textAlign: 'center'}}>
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
          {out.show_cta}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1380,
          width: '100%',
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: 400,
          fontSize: TYPE.howDoYouSay,
          color: COLORS.muted,
        }}
      >
        {out.show_url}
      </div>
    </AbsoluteFill>
  );
};
