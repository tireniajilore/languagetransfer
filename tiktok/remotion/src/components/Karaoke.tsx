import React from 'react';
import {useCurrentFrame} from 'remotion';
import {COLORS, FONT_DISPLAY, FPS, TYPE} from '../theme';

// Word-by-word caption of the spoken line — for silent autoplay. Kept quiet to
// stay out of the accent's way: the active + already-spoken words are ink, the
// rest muted, weight carries the cue. No colour highlight (lime is reserved for
// the answer) and no underline (atmospheric calm).
export const Karaoke: React.FC<{
  text: string;
  speechSec: number;
  top: number;
  fontSize?: number;
}> = ({text, speechSec, top, fontSize = TYPE.karaoke}) => {
  const frame = useCurrentFrame();
  const words = text.trim().split(/\s+/);
  const tLocal = frame / FPS;
  const prog = speechSec > 0 ? (tLocal / speechSec) * words.length : words.length;
  const curIdx = Math.floor(prog);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 90,
        right: 90,
        textAlign: 'center',
        fontFamily: FONT_DISPLAY,
        fontSize,
        lineHeight: 1.35,
      }}
    >
      {words.map((w, i) => {
        const active = i === curIdx;
        const spoken = i < curIdx;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              color: active || spoken ? COLORS.ink : COLORS.muted,
              fontWeight: active ? 600 : 400,
              marginRight: 14,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
