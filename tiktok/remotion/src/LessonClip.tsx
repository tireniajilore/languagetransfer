import React from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Background} from './components/Background';
import {Karaoke} from './components/Karaoke';
import {ProgressBar} from './components/Overlays';
import {ACTIVE_WIDTH, COLORS, FONT_DISPLAY, FONT_MONO, TYPE} from './theme';
import {LessonProps, LessonScene} from './lesson';

const fadeIn = (frame: number) => interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

// Teaching lines keep the show's signature karaoke — the spoken words highlight
// in time with the voice (top-centered, large).
const LINE_TOP = 820;

const displayFontSize = (text: string) => {
  const cleaned = text.trim();
  const longestWord = Math.max(...cleaned.split(/\s+/).map((word) => word.length), 0);
  if (cleaned.length > 32 || longestWord > 15) return 68;
  if (cleaned.length > 24) return 76;
  if (cleaned.length > 18) return 86;
  return TYPE.promptWord;
};

const phonFontSize = (text: string) => {
  const cleaned = text.trim();
  if (cleaned.length > 34) return 38;
  if (cleaned.length > 26) return 44;
  return 58;
};

const displayTextStyle = (text: string): React.CSSProperties => ({
  maxWidth: ACTIVE_WIDTH,
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: displayFontSize(text),
  lineHeight: 1.04,
  color: COLORS.ink,
  letterSpacing: 0,
  textAlign: 'center',
  overflowWrap: 'break-word',
});

// The five fixed vowels — staggered in, letter in ink, sound in lime mono.
const Vowels: React.FC = () => {
  const frame = useCurrentFrame();
  const rows: [string, string][] = [
    ['a', 'ah'],
    ['e', 'eh'],
    ['i', 'ee'],
    ['o', 'oh'],
    ['u', 'oo'],
  ];
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        {rows.map(([v, s], i) => {
          const o = interpolate(frame, [i * 5, i * 5 + 8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div key={v} style={{opacity: o, display: 'flex', alignItems: 'baseline', gap: 30, justifyContent: 'center'}}>
              <span style={{fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 92, color: COLORS.ink, width: 96, textAlign: 'right'}}>{v}</span>
              <span style={{fontFamily: FONT_MONO, fontWeight: 500, fontSize: 64, color: COLORS.accent}}>{s}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Prompt: the English word, big, with a lime SAY IT cue. The silent beat that
// follows (built into the scene duration) is the try-before-reveal gap.
const Prompt: React.FC<{word: string; durFrames: number}> = ({word, durFrames}) => {
  const frame = useCurrentFrame();
  const frac = Math.max(0, 1 - frame / durFrames);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: fadeIn(frame)}}>
      <div style={displayTextStyle(word)}>{word}</div>
      <div style={{marginTop: 40, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: 0, color: COLORS.accent}}>SAY IT</div>
      <div style={{marginTop: 30, width: 280, height: 3, background: COLORS.accent, opacity: 0.55, transform: `scaleX(${frac})`}} />
    </AbsoluteFill>
  );
};

// Reveal: the word resolves with its Spanish pronunciation in lime mono.
const Reveal: React.FC<{word: string; phon: string}> = ({word, phon}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: fadeIn(frame)}}>
      <div style={displayTextStyle(word)}>{word}</div>
      <div
        style={{
          marginTop: 30,
          maxWidth: ACTIVE_WIDTH,
          fontFamily: FONT_MONO,
          fontWeight: 500,
          fontSize: phonFontSize(phon),
          lineHeight: 1.18,
          letterSpacing: 0,
          color: COLORS.accent,
          textAlign: 'center',
          overflowWrap: 'break-word',
        }}
      >
        {phon}
      </div>
    </AbsoluteFill>
  );
};

const renderScene = (s: LessonScene) => {
  const audio = s.audioKey ? <Audio src={staticFile(`audio/${s.lessonId}/${s.audioKey}.mp3`)} /> : null;
  let content: React.ReactNode = null;
  if (s.kind === 'line') content = <Karaoke text={s.display ?? s.say ?? s.show ?? ''} speechSec={s.speechSec} top={LINE_TOP} fontSize={62} />;
  else if (s.kind === 'vowels') content = <Vowels />;
  else if (s.kind === 'prompt') content = <Prompt word={s.word ?? ''} durFrames={s.durFrames} />;
  else if (s.kind === 'reveal') content = <Reveal word={s.word ?? ''} phon={s.phon ?? ''} />;
  return (
    <>
      {audio}
      {content}
    </>
  );
};

export const LessonClip: React.FC<LessonProps> = ({scenes}) => {
  let offset = 0;
  return (
    <AbsoluteFill>
      <Background />
      <ProgressBar />
      {scenes.map((s, i) => {
        const from = offset;
        offset += s.durFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={s.durFrames}>
            {renderScene(s)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
