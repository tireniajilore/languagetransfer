import React from 'react';
import {AbsoluteFill} from 'remotion';
import {COLORS, FONT_DISPLAY, HEIGHT, WIDTH} from '../theme';

// Atmospheric canvas: near-black green ground with two diffuse radial blooms —
// a cool sky bloom up top, a lime bloom lower down. Fixed, no animation (per the
// atmospheric genre: the atmosphere does the work, it doesn't perform). The
// blooms are the only "decoration"; everything else is type on the canvas.
//
// `boost` lets a scene lift the lower bloom on the "your turn" beat (opacity
// only) without moving anything — a held breath, not a spin.
export const Background: React.FC<{boost?: number}> = ({boost = 0}) => {
  const sky = `radial-gradient(${WIDTH * 0.7}px ${HEIGHT * 0.32}px at 26% 16%, ${COLORS.bloomSky}1f, transparent 70%)`;
  const lime = `radial-gradient(${WIDTH * 0.8}px ${HEIGHT * 0.34}px at 74% 82%, ${COLORS.bloomLime}26, transparent 70%)`;
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.bg}}>
      <AbsoluteFill style={{background: sky}} />
      <AbsoluteFill style={{background: lime}} />
      {boost > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(${WIDTH * 0.6}px ${HEIGHT * 0.26}px at 50% 64%, ${COLORS.bloomLime}, transparent 70%)`,
            opacity: boost * 0.16,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const Header: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 56,
      width: '100%',
      textAlign: 'center',
      color: COLORS.muted,
      fontFamily: FONT_DISPLAY,
      fontWeight: 500,
      fontSize: 28,
      letterSpacing: 4,
    }}
  >
    LANGUAGE TRANSFER · SPANISH
  </div>
);
