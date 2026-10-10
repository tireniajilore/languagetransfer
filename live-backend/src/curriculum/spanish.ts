/**
 * Spanish subject module, v1.
 *
 * The first substantive concepts of Language Transfer Complete Spanish
 * (lessons 02–04): thinking in cognates and expressing want with
 * `quiero + infinitive`. All examples, misconceptions, and hints are authored
 * from the lesson transcripts and standard Spanish — nothing is invented.
 *
 * The harness consumes this through the generic `Curriculum` interface only.
 */

import { Curriculum } from './types';

export const SPANISH_CURRICULUM_V1: Curriculum = {
  version: 'spanish-v1-2026-10-10',
  subjectId: 'es',
  subjectName: 'Spanish (Language Transfer Complete Spanish, lessons 02–04)',
  concepts: [
    {
      id: 'es-copula',
      title: '“es”: it is / he is / she is',
      summary:
        'The learner derives that "es" covers "it is", "he is", and "she is" — ' +
        'Spanish does not need separate words for these; context does the work.',
      prerequisites: [],
      verifiedExamples: ['es normal', 'es legal', 'es importante', 'no es importante'],
      counterexamples: [
        'There is no separate Spanish word for "it" here — "it is normal" is just "es normal".',
      ],
      transferExamples: ['es posible', 'es diferente'],
    },
    {
      id: 'es-al-endings',
      title: 'Latin -AL cognates convert directly',
      summary:
        'English words ending in -AL come from Latin and convert directly to ' +
        'Spanish with the stress on the final syllable (metal, normal, legal).',
      prerequisites: [],
      verifiedExamples: ['metal', 'normal', 'legal'],
      counterexamples: [
        'NORmal with English stress is wrong — Spanish stresses the end: nor-MAL.',
      ],
      transferExamples: ['total', 'cultural'],
    },
    {
      id: 'es-ant-ent-endings',
      title: '-ant/-ent → -ante/-ente',
      summary:
        'English -ant/-ent words convert by adding -e: important → importante, ' +
        'different → diferente. The learner extends the cognate-thinking pattern.',
      prerequisites: ['es-al-endings'],
      verifiedExamples: ['importante', 'diferente', 'urgente'],
      counterexamples: [
        'Dropping the ending entirely ("important" → "importan") is wrong — add -e.',
      ],
      transferExamples: ['elegante', 'constante'],
    },
    {
      id: 'es-mente-adverbs',
      title: '-mente adverbs',
      summary:
        'Adverbs form by adding -mente to the converted adjective: ' +
        'urgente → urgentemente ("urgently").',
      prerequisites: ['es-ant-ent-endings'],
      verifiedExamples: ['urgentemente', 'normalmente'],
      counterexamples: [
        'English "-ly" has no Spanish equivalent word — do not translate "ly" separately.',
      ],
      transferExamples: ['rápidamente', 'tranquilamente'],
    },
    {
      id: 'es-ion-endings',
      title: '-ion → -ión',
      summary:
        'English -ion words convert to Spanish -ión with stress on the final ' +
        'syllable: opinion → opinión.',
      prerequisites: [],
      verifiedExamples: ['opinión', 'nación', 'cancelación'],
      counterexamples: [
        'o-PIN-ion with English stress is wrong — Spanish stresses the end: o-pi-NIÓN.',
      ],
      transferExamples: ['televisión', 'educación'],
    },
    {
      id: 'es-quiero-want',
      title: '“quiero”: I want',
      summary:
        'The learner derives "quiero" = "I want" and "no quiero" = "I don\'t want" ' +
        'from "te quiero" ("I want you"), noticing the verb ending carries the person.',
      prerequisites: [],
      verifiedExamples: ['quiero', 'no quiero', 'te quiero'],
      counterexamples: [
        '"Te quiero" is literally "I want you" — "te amo" is the weightier "I love you".',
      ],
      transferExamples: ['quiero comer', 'no quiero esperar'],
    },
    {
      id: 'es-quiero-infinitive',
      title: '“quiero” + infinitive',
      summary:
        'Desires combine with actions by stacking the infinitive directly after ' +
        'quiero — no "to" word: "quiero preparar", "no quiero cancelar".',
      prerequisites: ['es-quiero-want'],
      verifiedExamples: [
        'quiero preparar',
        'quiero cancelar',
        'no quiero cancelar',
        'quiero cooperar',
        'quiero explorar',
      ],
      counterexamples: [
        'There is no "to" between them — "quiero a cancelar" is wrong.',
      ],
      transferExamples: ['quiero aprender', 'no quiero trabajar'],
    },
  ],
  objectives: [
    {
      id: 'es-obj-cognates',
      subjectId: 'es',
      title: 'Think in cognates: unlock thousands of Spanish words',
      description:
        'Derive the Latin-cognate conversion patterns (-AL, -ant/-ent, -mente) ' +
        'and the "es" copula from English words the learner already knows.',
      conceptIds: ['es-copula', 'es-al-endings', 'es-ant-ent-endings', 'es-mente-adverbs'],
      entryConceptIds: ['es-copula', 'es-al-endings'],
      progression: {
        requiredConcepts: ['es-copula', 'es-al-endings', 'es-ant-ent-endings'],
        minCorrectEvidence: 2,
        requireTransferPass: true,
      },
      nextObjectiveId: 'es-obj-quiero',
    },
    {
      id: 'es-obj-quiero',
      subjectId: 'es',
      title: 'Wanting and doing: quiero + infinitive',
      description:
        'Derive "quiero" (I want) and combine it with infinitives to express ' +
        'desires, alongside the -ión cognate pattern.',
      conceptIds: ['es-ion-endings', 'es-quiero-want', 'es-quiero-infinitive'],
      entryConceptIds: ['es-ion-endings', 'es-quiero-want'],
      progression: {
        requiredConcepts: ['es-ion-endings', 'es-quiero-want', 'es-quiero-infinitive'],
        minCorrectEvidence: 2,
        requireTransferPass: true,
      },
    },
  ],
  misconceptions: [
    {
      id: 'm-al-stress',
      conceptId: 'es-al-endings',
      description: 'Learner keeps English stress (NORmal) instead of stressing the final syllable.',
      teacherGuidance:
        'Have them say it with exaggerated final stress (nor-MAL) and notice how Spanish -al words are agudas.',
    },
    {
      id: 'm-cognate-overapply',
      conceptId: 'es-al-endings',
      description: 'Learner assumes every English word converts by rule (e.g. inventing Spanish words).',
      teacherGuidance:
        'Draw the boundary: the method works on Latin-derived vocabulary with the specific endings taught — not every word. Ask them what makes "metal" a safe bet.',
    },
    {
      id: 'm-ant-drop',
      conceptId: 'es-ant-ent-endings',
      description: 'Learner drops the ending ("importan") instead of adding -e.',
      teacherGuidance:
        'Return to the pattern: -ant/-ent → -ante/-ente. Have them repair "importan" themselves.',
    },
    {
      id: 'm-quiero-yo-required',
      conceptId: 'es-quiero-want',
      description: 'Learner believes "yo" is mandatory before every verb ("yo quiero" always).',
      teacherGuidance:
        'Point at the ending: -o already says "I". "Yo" is optional emphasis, not required grammar.',
    },
    {
      id: 'm-quiero-to',
      conceptId: 'es-quiero-infinitive',
      description: 'Learner inserts a "to" word between quiero and the infinitive ("quiero a cancelar").',
      teacherGuidance:
        'Contrast with English: Spanish stacks the infinitive directly — "quiero cancelar", no word in between. Have them rebuild the sentence.',
    },
    {
      id: 'm-te-quiero-love',
      conceptId: 'es-quiero-want',
      description: 'Learner reads "te quiero" as only romantic "I love you".',
      teacherGuidance:
        'Decompose it: te (you) + quiero (I want) = literally "I want you". "Te amo" carries the romantic weight.',
    },
    // Ported from the PR #11 authored diagnosis catalogue (Layer C). Each has
    // a fixed spoken correction in the reasoning/diagnoses registry; the
    // teacherGuidance here is what the reasoning model sees when classifying.
    {
      id: 'm-ion-noun-for-verb',
      conceptId: 'es-ion-endings',
      description: 'Learner gives the -ción noun where the -ar verb was wanted (e.g. "cancelación" for "to cancel").',
      teacherGuidance:
        'Classify as noun-for-verb. The authored correction walks them back through the ending: off with -ción, on with -r.',
    },
    {
      id: 'm-ion-verb-for-noun',
      conceptId: 'es-ion-endings',
      description: 'Learner gives the -ar verb where the -ción noun was wanted.',
      teacherGuidance:
        'Classify as verb-for-noun. The authored correction runs the pattern in reverse: off with -ar, back on with -ción.',
    },
    {
      id: 'm-quiero-second-verb',
      conceptId: 'es-quiero-infinitive',
      description: 'Learner conjugates the second verb ("quiero cancelo") instead of leaving the infinitive.',
      teacherGuidance:
        'Classify as conjugated-second-verb. Contrast with English: in Spanish only the first verb moves; the second stays in its base form.',
    },
    {
      id: 'm-quiero-negation-added',
      conceptId: 'es-quiero-want',
      description: 'Learner adds "no" when the sentence was not negative.',
      teacherGuidance:
        'Classify as added-negation. "No" flips the meaning; have them take it back out and say it straight.',
    },
    {
      id: 'm-quiero-negation-missing',
      conceptId: 'es-quiero-want',
      description: 'Learner leaves out "no" when the sentence needed it.',
      teacherGuidance:
        'Classify as missing-negation. In Spanish "no" parks straight in front of the verb; nothing else changes.',
    },
  ],
  hints: [
    {
      id: 'h-copula-1',
      conceptId: 'es-copula',
      level: 1,
      text: 'English needs "it", "he", "she". Listen to what Spanish needs — how many words did you hear for "he is normal"?',
    },
    {
      id: 'h-copula-2',
      conceptId: 'es-copula',
      level: 2,
      text: 'One word does all three jobs. It starts with "e" and you have heard it in "es normal".',
    },
    {
      id: 'h-al-1',
      conceptId: 'es-al-endings',
      level: 1,
      text: 'Say the English word "metal" slowly. Now keep every letter and move the stress to the very end.',
    },
    {
      id: 'h-al-2',
      conceptId: 'es-al-endings',
      level: 2,
      text: 'These words are spelled identically in both languages — only the music changes. Try "legal" with the stress on -GAL.',
    },
    {
      id: 'h-ant-1',
      conceptId: 'es-ant-ent-endings',
      level: 1,
      text: 'You already convert -AL words. What is the smallest change that makes "important" sound Spanish?',
    },
    {
      id: 'h-ant-2',
      conceptId: 'es-ant-ent-endings',
      level: 2,
      text: 'Add one letter at the end: -e. "Important" becomes "importante". Now try "different".',
    },
    {
      id: 'h-mente-1',
      conceptId: 'es-mente-adverbs',
      level: 1,
      text: 'You know "urgente". English adds "-ly" for "urgently" — what single ending could Spanish add?',
    },
    {
      id: 'h-mente-2',
      conceptId: 'es-mente-adverbs',
      level: 2,
      text: 'The ending is "-mente". Build it: urgente + mente.',
    },
    {
      id: 'h-ion-1',
      conceptId: 'es-ion-endings',
      level: 1,
      text: 'Same cognate thinking as -AL, but this ending carries an accent. Where does the stress fall in "opinión"?',
    },
    {
      id: 'h-ion-2',
      conceptId: 'es-ion-endings',
      level: 2,
      text: '-ion becomes -ión, stressed on the last syllable. Try "nación" for "nation".',
    },
    {
      id: 'h-quiero-1',
      conceptId: 'es-quiero-want',
      level: 1,
      text: '"Te quiero" means "I want you", and "te" means "you". What is left for "I want"?',
    },
    {
      id: 'h-quiero-2',
      conceptId: 'es-quiero-want',
      level: 2,
      text: 'Remove "te" and you are left with "quiero". For "I don\'t want", Spanish puts "no" in front — like "no es importante".',
    },
    {
      id: 'h-quiero-inf-1',
      conceptId: 'es-quiero-infinitive',
      level: 1,
      text: 'You know "quiero" and you know infinitives like "cancelar". In English a little word sits between them — does Spanish need it?',
    },
    {
      id: 'h-quiero-inf-2',
      conceptId: 'es-quiero-infinitive',
      level: 2,
      text: 'No word in between — just stack them: "quiero" + "cancelar". Try "I want to prepare".',
    },
    {
      id: 'h-quiero-inf-3',
      conceptId: 'es-quiero-infinitive',
      level: 3,
      text: 'Say "quiero", then immediately the infinitive: quiero preparar. Now negate it with "no" at the front.',
    },
  ],
};
