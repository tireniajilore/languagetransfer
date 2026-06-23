import lesson02Vowels from './scripts/lesson-02-vowels.json';
import lesson03Es from './scripts/lesson-03-es.json';
import lesson04NoEs from './scripts/lesson-04-no-es.json';
import lesson05AntEnt from './scripts/lesson-05-ant-ent.json';
import lesson06MenteAdverbs from './scripts/lesson-06-mente-adverbs.json';
import lesson07JSound from './scripts/lesson-07-j-sound.json';
import lesson08AbleIble from './scripts/lesson-08-able-ible.json';
import lesson09FirstStack from './scripts/lesson-09-first-stack.json';
import lesson10MixedPatterns from './scripts/lesson-10-mixed-patterns.json';
import lesson11PossibleImpossible from './scripts/lesson-11-possible-impossible.json';
import lesson12ProbablyPossible from './scripts/lesson-12-probably-possible.json';
import lesson13QuieroNoQuiero from './scripts/lesson-13-quiero-no-quiero.json';
import lesson14TionCion from './scripts/lesson-14-tion-cion.json';
import lesson15AcionToAr from './scripts/lesson-15-acion-to-ar.json';
import lesson16QuieroVerbs from './scripts/lesson-16-quiero-verbs.json';
import lesson17YoEmphasis from './scripts/lesson-17-yo-emphasis.json';
import lesson18MeInformarme from './scripts/lesson-18-me-informarme.json';
import lesson19TeObligarte from './scripts/lesson-19-te-obligarte.json';
import lesson20LoCancelarlo from './scripts/lesson-20-lo-cancelarlo.json';
import lesson21RSound from './scripts/lesson-21-r-sound.json';
import lesson22LongRouteVerbs from './scripts/lesson-22-long-route-verbs.json';
import lesson23EnceAnce from './scripts/lesson-23-ence-ance.json';
import spanishCognates01 from './scripts/spanish-cognates-01.json';

export const COGNATES_COURSE_VERSION = '2026-06-22.v2';

export interface CognatesCourseSection {
  id: string;
  sourceScriptId: string;
}

export interface CognatesCourseLesson {
  id: string;
  number: number;
  title: string;
  promise: string;
  estimatedMinutes: number;
  sections: CognatesCourseSection[];
}

export interface CognatesCourseManifest {
  id: string;
  title: string;
  description: string;
  version: string;
  lessons: CognatesCourseLesson[];
}

export const COGNATES_COURSE: CognatesCourseManifest = {
  id: 'spanish-cognates',
  title: 'Spanish cognates starter',
  description: 'A five-lesson speaking path that turns English word patterns into Spanish sentences.',
  version: COGNATES_COURSE_VERSION,
  lessons: [
    {
      id: 'sounds-like-spanish',
      number: 1,
      title: 'Your first Spanish sentences',
      promise: 'Find the Spanish you already know, then use vowels, es, and no es to make the first sentences.',
      estimatedMinutes: 8,
      sections: [
        { id: 'al-words', sourceScriptId: 'spanish-cognates-01' },
        { id: 'vowels', sourceScriptId: 'lesson-02-vowels' },
        { id: 'es', sourceScriptId: 'lesson-03-es' },
        { id: 'no-es', sourceScriptId: 'lesson-04-no-es' }
      ]
    },
    {
      id: 'cognate-toolkit',
      number: 2,
      title: 'Patterns that start to stack',
      promise: 'Add ant/ent, mente, the j sound, and able/ible, then stack them into real sentences.',
      estimatedMinutes: 12,
      sections: [
        { id: 'ant-ent', sourceScriptId: 'lesson-05-ant-ent' },
        { id: 'mente', sourceScriptId: 'lesson-06-mente-adverbs' },
        { id: 'j-sound', sourceScriptId: 'lesson-07-j-sound' },
        { id: 'able-ible', sourceScriptId: 'lesson-08-able-ible' },
        { id: 'first-stack', sourceScriptId: 'lesson-09-first-stack' }
      ]
    },
    {
      id: 'build-real-sentences',
      number: 3,
      title: 'Possible, probable, quiero',
      promise: 'Keep stacking normal, possible, and probable sentences, then open the quiero route.',
      estimatedMinutes: 12,
      sections: [
        { id: 'mixed-patterns', sourceScriptId: 'lesson-10-mixed-patterns' },
        { id: 'possible-impossible', sourceScriptId: 'lesson-11-possible-impossible' },
        { id: 'probably-possible', sourceScriptId: 'lesson-12-probably-possible' },
        { id: 'quiero-no-quiero', sourceScriptId: 'lesson-13-quiero-no-quiero' },
        { id: 'tion-cion', sourceScriptId: 'lesson-14-tion-cion' }
      ]
    },
    {
      id: 'wanting-doing-emphasis',
      number: 4,
      title: 'From -acion to action',
      promise: 'Convert -acion into verbs, build quiero + verb sentences, then add yo, me, and te.',
      estimatedMinutes: 11,
      sections: [
        { id: 'acion-to-ar', sourceScriptId: 'lesson-15-acion-to-ar' },
        { id: 'quiero-verbs', sourceScriptId: 'lesson-16-quiero-verbs' },
        { id: 'yo-emphasis', sourceScriptId: 'lesson-17-yo-emphasis' },
        { id: 'me-informarme', sourceScriptId: 'lesson-18-me-informarme' },
        { id: 'te-obligarte', sourceScriptId: 'lesson-19-te-obligarte' }
      ]
    },
    {
      id: 'longer-spanish-routes',
      number: 5,
      title: 'Lo, R, and longer routes',
      promise: 'Finish lo routes, place the R sound where it belongs, and add long-route verbs plus ence/ance.',
      estimatedMinutes: 7,
      sections: [
        { id: 'lo-cancelarlo', sourceScriptId: 'lesson-20-lo-cancelarlo' },
        { id: 'r-sound', sourceScriptId: 'lesson-21-r-sound' },
        { id: 'long-route-verbs', sourceScriptId: 'lesson-22-long-route-verbs' },
        { id: 'ence-ance', sourceScriptId: 'lesson-23-ence-ance' }
      ]
    }
  ]
};

export const COGNATES_SCRIPT_BY_ID = {
  'spanish-cognates-01': spanishCognates01,
  'lesson-02-vowels': lesson02Vowels,
  'lesson-03-es': lesson03Es,
  'lesson-04-no-es': lesson04NoEs,
  'lesson-05-ant-ent': lesson05AntEnt,
  'lesson-06-mente-adverbs': lesson06MenteAdverbs,
  'lesson-07-j-sound': lesson07JSound,
  'lesson-08-able-ible': lesson08AbleIble,
  'lesson-09-first-stack': lesson09FirstStack,
  'lesson-10-mixed-patterns': lesson10MixedPatterns,
  'lesson-11-possible-impossible': lesson11PossibleImpossible,
  'lesson-12-probably-possible': lesson12ProbablyPossible,
  'lesson-13-quiero-no-quiero': lesson13QuieroNoQuiero,
  'lesson-14-tion-cion': lesson14TionCion,
  'lesson-15-acion-to-ar': lesson15AcionToAr,
  'lesson-16-quiero-verbs': lesson16QuieroVerbs,
  'lesson-17-yo-emphasis': lesson17YoEmphasis,
  'lesson-18-me-informarme': lesson18MeInformarme,
  'lesson-19-te-obligarte': lesson19TeObligarte,
  'lesson-20-lo-cancelarlo': lesson20LoCancelarlo,
  'lesson-21-r-sound': lesson21RSound,
  'lesson-22-long-route-verbs': lesson22LongRouteVerbs,
  'lesson-23-ence-ance': lesson23EnceAnce
} as const;

export type CognatesScriptId = keyof typeof COGNATES_SCRIPT_BY_ID;
