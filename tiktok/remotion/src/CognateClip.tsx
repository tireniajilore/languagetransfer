import React from 'react';
import {AbsoluteFill, Audio, Freeze, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Background} from './components/Background';
import {ProgressBar} from './components/Overlays';
import {Hook} from './scenes/Hook';
import {Lead} from './scenes/Lead';
import {Prompt, Ring, Reveal} from './scenes/Card';
import {Outro} from './scenes/Outro';
import {Scene, ClipProps} from './script';

const renderScene = (s: Scene) => {
  // The scene's voice clip, if any (ring + loop are silent beats).
  const audio = s.audioKey ? <Audio src={staticFile(`audio/${s.audioKey}.mp3`)} /> : null;
  return (
    <>
      {audio}
      {renderSceneContent(s)}
    </>
  );
};

const renderSceneContent = (s: Scene) => {
  switch (s.kind) {
    case 'hook':
      return <Hook speechSec={s.speechSec} />;
    case 'loop':
      // Freeze at frame 0 so the final frame reproduces the hook's first frame
      // exactly -> the clip loops invisibly.
      return (
        <Freeze frame={0}>
          <Hook speechSec={s.speechSec} />
        </Freeze>
      );
    case 'lead':
      return <Lead speechSec={s.speechSec} />;
    case 'prompt':
      return <Prompt cardIndex={s.cardIndex!} speechSec={s.speechSec} />;
    case 'ring':
      return <Ring cardIndex={s.cardIndex!} />;
    case 'reveal':
      return <Reveal cardIndex={s.cardIndex!} />;
    case 'outro':
      return <Outro speechSec={s.speechSec} />;
    default:
      return null;
  }
};

// Find the scene covering the global frame, plus the local frame within it.
const activeAt = (scenes: Scene[], frame: number) => {
  let offset = 0;
  for (const s of scenes) {
    if (frame < offset + s.durFrames) {
      return {scene: s, localFrame: frame - offset};
    }
    offset += s.durFrames;
  }
  return {scene: scenes[scenes.length - 1], localFrame: 0};
};

export const CognateClip: React.FC<ClipProps> = ({scenes}) => {
  const frame = useCurrentFrame();
  const {scene, localFrame} = activeAt(scenes, frame);

  // The lower bloom swells then recedes across the "your turn" beat — a held
  // breath, opacity only. 0 everywhere else.
  const bloomBoost =
    scene.kind === 'ring' ? Math.sin((Math.PI * localFrame) / scene.durFrames) : 0;

  let offset = 0;
  return (
    <AbsoluteFill>
      <Background boost={bloomBoost} />
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
