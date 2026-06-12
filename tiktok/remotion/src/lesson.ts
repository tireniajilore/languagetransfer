import lesson02Json from '../../scripts/lesson-02-vowels.json';
import lesson03Json from '../../scripts/lesson-03-es.json';
import lesson04Json from '../../scripts/lesson-04-no-es.json';
import lesson05Json from '../../scripts/lesson-05-ant-ent.json';
import lesson06Json from '../../scripts/lesson-06-mente-adverbs.json';
import {FPS} from './theme';

// A lesson is a flat list of segments. Each spoken segment becomes its own audio
// clip (so timing is measured from the real VO, same pattern as the cognate
// clip). `prompt` segments carry a silent thinking BEAT after any speech; that's
// the try-before-reveal pause.
export type Segment = {
  kind: 'line' | 'vowels' | 'prompt' | 'reveal';
  lang?: 'en' | 'es';
  say?: string;
  show?: string;
  word?: string;
  phon?: string;
};

export type Lesson = {
  id: string;
  title: string;
  segments: Segment[];
  caption: string;
  hashtags: string[];
};

// Dry estimate for preview before audio exists (mirrors the cognate estimator).
const estDur = (text: string) => Math.max(0.8, text.trim().split(/\s+/).length / 2.3);

export type LessonScene = {
  kind: Segment['kind'];
  lessonId: string;
  durFrames: number;
  speechSec: number;
  audioKey?: string; // public/audio/<lessonId>/<audioKey>.mp3
  say?: string; // the spoken words — karaoke on teaching lines highlights these
  show?: string;
  word?: string;
  phon?: string;
};

const f = (s: number) => Math.round(s * FPS);
const PAD = 0.35; // breathing room after a teaching line
const BEAT = 1.3; // silent thinking pause on a prompt — the try-before-reveal gap
const HOLD = 0.7; // hold after a reveal lands

export const audioKeyFor = (i: number) => `seg-${String(i).padStart(2, '0')}`;

export function buildLessonScenes(L: Lesson, dur?: Record<string, number>): LessonScene[] {
  return L.segments.map((seg, i) => {
    const sayText = seg.say;
    const key = audioKeyFor(i);
    const speech = sayText ? dur?.[key] ?? estDur(sayText) : 0;
    let durFrames: number;
    if (seg.kind === 'prompt') durFrames = f(speech + BEAT);
    else if (seg.kind === 'reveal') durFrames = f(speech + HOLD);
    else durFrames = f(speech + PAD);
    return {
      kind: seg.kind,
      lessonId: L.id,
      durFrames,
      speechSec: speech,
      audioKey: sayText ? key : undefined,
      say: seg.say,
      show: seg.show,
      word: seg.word,
      phon: seg.phon,
    };
  });
}

export const lessonTotalFrames = (scenes: LessonScene[]) =>
  scenes.reduce((a, b) => a + b.durFrames, 0);

export type LessonProps = {scenes: LessonScene[]};

export const lessons = {
  lesson02: lesson02Json as Lesson,
  lesson03Es: lesson03Json as Lesson,
  lesson04NoEs: lesson04Json as Lesson,
  lesson05AntEnt: lesson05Json as Lesson,
  lesson06MenteAdverbs: lesson06Json as Lesson,
};

export const lesson = lessons.lesson02;
