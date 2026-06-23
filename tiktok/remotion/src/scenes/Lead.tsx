import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {COLORS, FONT_DISPLAY, TYPE} from '../theme';
import {Karaoke} from '../components/Karaoke';
import {script} from '../script';

export const Lead: React.FC<{speechSec: number}> = ({speechSec}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  const li = script.lead_in!;
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
      <div style={{position: 'absolute', top: 680, width: '100%'}}>
        {li.show_main.split('\n').map((ln, i) => (
          <p key={i} style={big}>
            {ln}
          </p>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 980,
          width: '100%',
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: 400,
          fontSize: TYPE.howDoYouSay,
          color: COLORS.muted,
        }}
      >
        {li.show_sub}
      </div>
      <Karaoke text={li.say} speechSec={speechSec} top={1240} />
    </AbsoluteFill>
  );
};
