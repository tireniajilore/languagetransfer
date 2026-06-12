import React from 'react';
import {CalculateMetadataFunction, Composition, staticFile} from 'remotion';
import {getAudioDurationInSeconds} from '@remotion/media-utils';
import {CognateClip} from './CognateClip';
import {LessonClip} from './LessonClip';
import {FPS, WIDTH, HEIGHT} from './theme';
import {buildScenes, script, totalFrames, ClipProps} from './script';
import {
  audioKeyFor,
  buildLessonScenes,
  Lesson,
  LessonProps,
  lessonTotalFrames,
  lessons,
} from './lesson';

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

// Lesson compositions — same audio-driven sizing, keyed by segment index. Audio
// lives under public/audio/<lessonId>/seg-NN.mp3.
const calculateLessonMetadata =
  (lesson: Lesson): CalculateMetadataFunction<LessonProps> =>
  async () => {
    const lessonAudioKeys = lesson.segments
      .map((s, i) => (s.say ? audioKeyFor(i) : null))
      .filter((x): x is string => x !== null);
    const measured = await Promise.all(
      lessonAudioKeys.map(async (k) => {
        try {
          return [k, await getAudioDurationInSeconds(staticFile(`audio/${lesson.id}/${k}.mp3`))] as const;
        } catch {
          return [k, undefined] as const;
        }
      }),
    );
    const durations: Record<string, number> = {};
    for (const [k, v] of measured) if (v !== undefined) durations[k] = v;

    const scenes = buildLessonScenes(lesson, durations);
    return {
      durationInFrames: lessonTotalFrames(scenes),
      props: {scenes},
    };
  };

const lessonCompositions = [
  ['Lesson02', lessons.lesson02],
  ['Lesson03Es', lessons.lesson03Es],
  ['Lesson04NoEs', lessons.lesson04NoEs],
  ['Lesson05AntEnt', lessons.lesson05AntEnt],
  ['Lesson06MenteAdverbs', lessons.lesson06MenteAdverbs],
] as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
      {lessonCompositions.map(([id, currentLesson]) => (
        <Composition
          key={id}
          id={id}
          component={LessonClip}
          durationInFrames={1}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{scenes: [] as LessonProps['scenes']}}
          calculateMetadata={calculateLessonMetadata(currentLesson)}
        />
      ))}
    </>
  );
};
