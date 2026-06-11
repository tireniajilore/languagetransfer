import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {ACTIVE_WIDTH, COLORS, FONT_DISPLAY, SAFE_X, TYPE} from '../theme';

// Progress bar — 6px tall, 920px wide, faint track, lime fill, 160px from
// bottom. Signals "almost done" -> lifts completion rate.
export const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const pct = Math.min(100, (frame / durationInFrames) * 100);
  return (
    <div style={{position: 'absolute', bottom: 160, left: SAFE_X, width: ACTIVE_WIDTH, height: 6}}>
      <div style={{position: 'absolute', inset: 0, background: COLORS.track, borderRadius: 3}} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: 6,
          width: `${pct}%`,
          background: COLORS.accent,
          borderRadius: 3,
        }}
      />
    </div>
  );
};

// Card counter — top-right, 80px from right edge, 120px from top.
export const CardCounter: React.FC<{index: number; total: number}> = ({index, total}) => (
  <div
    style={{
      position: 'absolute',
      top: 120,
      right: SAFE_X,
      fontFamily: FONT_DISPLAY,
      fontWeight: 500,
      fontSize: TYPE.counter,
      letterSpacing: 2,
      color: COLORS.muted,
    }}
  >
    {index + 1} / {total}
  </div>
);
