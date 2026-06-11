import React from 'react';
import {CalculateMetadataFunction, Composition, staticFile} from 'remotion';
import {getAudioDurationInSeconds} from '@remotion/media-utils';
import {CognateClip} from './CognateClip';
import {FPS, WIDTH, HEIGHT} from './theme';
import {buildScenes, script, totalFrames, ClipProps} from './script';

// Every audioKey buildScenes can produce, derived from the script shape.
const audioKeys = [
  'hook',
  'lead',
  ...script.cards.flatMap((_, i) => [`card${i}_prompt`, `card${i}_reveal`]),
  'outro',
];

// Measure the real ElevenLabs clip durations, then size the composition from
// them (Remotion best practice: calculateMetadata). If a clip is missing (audio
// not yet synthesized), buildScenes falls back to the dry estimator for that
// key, so the composition always builds.
const calculateMetadata: CalculateMetadataFunction<ClipProps> = async () => {
  const measured = await Promise.all(
    audioKeys.map(async (k) => {
      try {
        return [k, await getAudioDurationInSeconds(staticFile(`audio/${k}.mp3`))] as const;
      } catch {
        return [k, undefined] as const;
      }
    }),
  );
  const durations: Record<string, number> = {};
  for (const [k, v] of measured) if (v !== undefined) durations[k] = v;

  const scenes = buildScenes(script, durations);
  return {
    durationInFrames: totalFrames(scenes),
    props: {scenes},
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CognateClip"
      component={CognateClip}
      durationInFrames={1}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{scenes: [] as ClipProps['scenes']}}
      calculateMetadata={calculateMetadata}
    />
  );
};
