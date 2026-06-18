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

// Lesson compositions — same audio-driven sizing, keyed by segment index (or an
// explicit per-segment audio key for remix variants). Audio lives under
// public/audio/<audioDir>/seg-NN.mp3, where audioDir defaults to the lesson id.
const calculateLessonMetadata =
  (lesson: Lesson): CalculateMetadataFunction<LessonProps> =>
  async () => {
    const audioDir = lesson.audioDir ?? lesson.id;
    const lessonAudioKeys = lesson.segments
      .map((s, i) => (s.say ? s.audio ?? audioKeyFor(i) : null))
      .filter((x): x is string => x !== null);
    const measured = await Promise.all(
      lessonAudioKeys.map(async (k) => {
        try {
          return [k, await getAudioDurationInSeconds(staticFile(`audio/${audioDir}/${k}.mp3`))] as const;
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
  ['Lesson07JSound', lessons.lesson07JSound],
  ['Lesson08AbleIble', lessons.lesson08AbleIble],
  ['Lesson09FirstStack', lessons.lesson09FirstStack],
  ['Lesson10MixedPatterns', lessons.lesson10MixedPatterns],
  ['Lesson11PossibleImpossible', lessons.lesson11PossibleImpossible],
  ['Lesson12ProbablyPossible', lessons.lesson12ProbablyPossible],
  ['Lesson13QuieroNoQuiero', lessons.lesson13QuieroNoQuiero],
  ['Lesson14TionCion', lessons.lesson14TionCion],
  ['Lesson15AcionToAr', lessons.lesson15AcionToAr],
  ['Lesson16QuieroVerbs', lessons.lesson16QuieroVerbs],
  ['Lesson17YoEmphasis', lessons.lesson17YoEmphasis],
  ['Lesson18MeInformarme', lessons.lesson18MeInformarme],
  ['Lesson19TeObligarte', lessons.lesson19TeObligarte],
  ['Lesson20LoCancelarlo', lessons.lesson20LoCancelarlo],
  ['Lesson21RSound', lessons.lesson21RSound],
  ['Lesson22LongRouteVerbs', lessons.lesson22LongRouteVerbs],
  ['Lesson23EnceAnce', lessons.lesson23EnceAnce],
  // Micro-cut variants (~15s)
  ['Lesson02Micro', lessons.lesson02Micro],
  ['Lesson03Micro', lessons.lesson03Micro],
  ['Lesson04Micro', lessons.lesson04Micro],
  ['Lesson05Micro', lessons.lesson05Micro],
  ['Lesson06Micro', lessons.lesson06Micro],
  ['Lesson07Micro', lessons.lesson07Micro],
  ['Lesson08Micro', lessons.lesson08Micro],
  ['Lesson09Micro', lessons.lesson09Micro],
  ['Lesson10Micro', lessons.lesson10Micro],
  ['Lesson11Micro', lessons.lesson11Micro],
  ['Lesson12Micro', lessons.lesson12Micro],
  ['Lesson13Micro', lessons.lesson13Micro],
  ['Lesson14Micro', lessons.lesson14Micro],
  ['Lesson15Micro', lessons.lesson15Micro],
  ['Lesson16Micro', lessons.lesson16Micro],
  ['Lesson17Micro', lessons.lesson17Micro],
  ['Lesson18Micro', lessons.lesson18Micro],
  ['Lesson19Micro', lessons.lesson19Micro],
  ['Lesson20Micro', lessons.lesson20Micro],
  ['Lesson21Micro', lessons.lesson21Micro],
  ['Lesson22Micro', lessons.lesson22Micro],
  ['Lesson23Micro', lessons.lesson23Micro],
  // Quiz-first variants (cold-open on a prompt)
  ['Lesson02Quiz', lessons.lesson02Quiz],
  ['Lesson03Quiz', lessons.lesson03Quiz],
  ['Lesson04Quiz', lessons.lesson04Quiz],
  ['Lesson05Quiz', lessons.lesson05Quiz],
  ['Lesson06Quiz', lessons.lesson06Quiz],
  ['Lesson07Quiz', lessons.lesson07Quiz],
  ['Lesson08Quiz', lessons.lesson08Quiz],
  ['Lesson09Quiz', lessons.lesson09Quiz],
  ['Lesson10Quiz', lessons.lesson10Quiz],
  ['Lesson11Quiz', lessons.lesson11Quiz],
  ['Lesson12Quiz', lessons.lesson12Quiz],
  ['Lesson13Quiz', lessons.lesson13Quiz],
  ['Lesson14Quiz', lessons.lesson14Quiz],
  ['Lesson15Quiz', lessons.lesson15Quiz],
  ['Lesson16Quiz', lessons.lesson16Quiz],
  ['Lesson17Quiz', lessons.lesson17Quiz],
  ['Lesson18Quiz', lessons.lesson18Quiz],
  ['Lesson19Quiz', lessons.lesson19Quiz],
  ['Lesson20Quiz', lessons.lesson20Quiz],
  ['Lesson21Quiz', lessons.lesson21Quiz],
  ['Lesson22Quiz', lessons.lesson22Quiz],
  ['Lesson23Quiz', lessons.lesson23Quiz],
  // Hook-swap variants (same body, new opening line)
  ['Lesson02HookA', lessons.lesson02HookA],
  ['Lesson03HookA', lessons.lesson03HookA],
  ['Lesson04HookA', lessons.lesson04HookA],
  ['Lesson05HookA', lessons.lesson05HookA],
  ['Lesson06HookA', lessons.lesson06HookA],
  ['Lesson07HookA', lessons.lesson07HookA],
  ['Lesson08HookA', lessons.lesson08HookA],
  ['Lesson09HookA', lessons.lesson09HookA],
  ['Lesson10HookA', lessons.lesson10HookA],
  ['Lesson11HookA', lessons.lesson11HookA],
  ['Lesson12HookA', lessons.lesson12HookA],
  ['Lesson13HookA', lessons.lesson13HookA],
  ['Lesson14HookA', lessons.lesson14HookA],
  ['Lesson15HookA', lessons.lesson15HookA],
  ['Lesson16HookA', lessons.lesson16HookA],
  ['Lesson17HookA', lessons.lesson17HookA],
  ['Lesson18HookA', lessons.lesson18HookA],
  ['Lesson19HookA', lessons.lesson19HookA],
  ['Lesson20HookA', lessons.lesson20HookA],
  ['Lesson21HookA', lessons.lesson21HookA],
  ['Lesson22HookA', lessons.lesson22HookA],
  ['Lesson23HookA', lessons.lesson23HookA],
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
