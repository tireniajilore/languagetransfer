import lesson02Vowels from '../../../../tiktok/scripts/lesson-02-vowels.json';
import lesson03Es from '../../../../tiktok/scripts/lesson-03-es.json';
import lesson04NoEs from '../../../../tiktok/scripts/lesson-04-no-es.json';
import lesson05AntEnt from '../../../../tiktok/scripts/lesson-05-ant-ent.json';
import lesson06MenteAdverbs from '../../../../tiktok/scripts/lesson-06-mente-adverbs.json';
import lesson07JSound from '../../../../tiktok/scripts/lesson-07-j-sound.json';
import lesson08AbleIble from '../../../../tiktok/scripts/lesson-08-able-ible.json';
import lesson09FirstStack from '../../../../tiktok/scripts/lesson-09-first-stack.json';
import lesson10MixedPatterns from '../../../../tiktok/scripts/lesson-10-mixed-patterns.json';
import lesson11PossibleImpossible from '../../../../tiktok/scripts/lesson-11-possible-impossible.json';
import lesson12ProbablyPossible from '../../../../tiktok/scripts/lesson-12-probably-possible.json';
import lesson13QuieroNoQuiero from '../../../../tiktok/scripts/lesson-13-quiero-no-quiero.json';
import lesson14TionCion from '../../../../tiktok/scripts/lesson-14-tion-cion.json';
import lesson15AcionToAr from '../../../../tiktok/scripts/lesson-15-acion-to-ar.json';
import lesson16QuieroVerbs from '../../../../tiktok/scripts/lesson-16-quiero-verbs.json';
import lesson17YoEmphasis from '../../../../tiktok/scripts/lesson-17-yo-emphasis.json';
import lesson18MeInformarme from '../../../../tiktok/scripts/lesson-18-me-informarme.json';
import lesson19TeObligarte from '../../../../tiktok/scripts/lesson-19-te-obligarte.json';
import lesson20LoCancelarlo from '../../../../tiktok/scripts/lesson-20-lo-cancelarlo.json';
import lesson21RSound from '../../../../tiktok/scripts/lesson-21-r-sound.json';
import lesson22LongRouteVerbs from '../../../../tiktok/scripts/lesson-22-long-route-verbs.json';
import lesson23EnceAnce from '../../../../tiktok/scripts/lesson-23-ence-ance.json';
import spanishCognates01 from '../../../../tiktok/scripts/spanish-cognates-01.json';

export const COGNATES_COURSE_VERSION = '2026-06-18.v1';

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
  title: 'Spanish Cognates Starter',
  description: 'A five-lesson speaking path that turns English word patterns into Spanish sentences.',
  version: COGNATES_COURSE_VERSION,
  lessons: [
    {
      id: 'sounds-like-spanish',
      number: 1,
      title: 'Spanish Sounds Like Spanish',
      promise: 'Use Spanish vowels, es/no es, and two sounds that stop English from steering.',
      estimatedMinutes: 8,
      sections: [
        { id: 'vowels', sourceScriptId: 'lesson-02-vowels' },
        { id: 'es', sourceScriptId: 'lesson-03-es' },
        { id: 'no-es', sourceScriptId: 'lesson-04-no-es' },
        { id: 'j-sound', sourceScriptId: 'lesson-07-j-sound' },
        { id: 'r-sound', sourceScriptId: 'lesson-21-r-sound' }
      ]
    },
    {
      id: 'cognate-toolkit',
      number: 2,
      title: 'Your First Cognate Toolkit',
      promise: 'Turn familiar English endings into Spanish words you can say out loud.',
      estimatedMinutes: 7,
      sections: [
        { id: 'al-words', sourceScriptId: 'spanish-cognates-01' },
        { id: 'ant-ent', sourceScriptId: 'lesson-05-ant-ent' },
        { id: 'able-ible', sourceScriptId: 'lesson-08-able-ible' },
        { id: 'tion-cion', sourceScriptId: 'lesson-14-tion-cion' },
        { id: 'ence-ance', sourceScriptId: 'lesson-23-ence-ance' }
      ]
    },
    {
      id: 'build-real-sentences',
      number: 3,
      title: 'Build Real Sentences',
      promise: 'Stack the patterns into full sentences without memorizing a phrasebook.',
      estimatedMinutes: 11,
      sections: [
        { id: 'mente', sourceScriptId: 'lesson-06-mente-adverbs' },
        { id: 'first-stack', sourceScriptId: 'lesson-09-first-stack' },
        { id: 'mixed-patterns', sourceScriptId: 'lesson-10-mixed-patterns' },
        { id: 'possible-impossible', sourceScriptId: 'lesson-11-possible-impossible' },
        { id: 'probably-possible', sourceScriptId: 'lesson-12-probably-possible' }
      ]
    },
    {
      id: 'wanting-doing-emphasis',
      number: 4,
      title: 'Wanting, Doing, and Emphasis',
      promise: 'Build useful quiero sentences and feel when yo is actually doing work.',
      estimatedMinutes: 7,
      sections: [
        { id: 'quiero-no-quiero', sourceScriptId: 'lesson-13-quiero-no-quiero' },
        { id: 'quiero-verbs', sourceScriptId: 'lesson-16-quiero-verbs' },
        { id: 'yo-emphasis', sourceScriptId: 'lesson-17-yo-emphasis' }
      ]
    },
    {
      id: 'longer-spanish-routes',
      number: 5,
      title: 'Longer Spanish Routes',
      promise: 'Handle longer verb routes with me, te, lo, and -acion without panicking.',
      estimatedMinutes: 10,
      sections: [
        { id: 'acion-to-ar', sourceScriptId: 'lesson-15-acion-to-ar' },
        { id: 'me-informarme', sourceScriptId: 'lesson-18-me-informarme' },
        { id: 'te-obligarte', sourceScriptId: 'lesson-19-te-obligarte' },
        { id: 'lo-cancelarlo', sourceScriptId: 'lesson-20-lo-cancelarlo' },
        { id: 'long-route-verbs', sourceScriptId: 'lesson-22-long-route-verbs' }
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
