/**
 * Authored diagnosis catalogue (Layer C, classify-not-generate).
 *
 * Ported from PR #11's `lt-runner/src/lib/diagnoses.ts` (reviewed, not
 * merged). The design decision survives the port: a model asked to WRITE a
 * correction produces clinically correct prose in the wrong voice and gets the
 * diagnosis right about half the time. Asked to PICK from a list, it does the
 * part it is good at (classification) and never writes a word the learner
 * hears.
 *
 * So the backend reasoning model chooses an id. The `say` text below is
 * authored, mined from the 90 transcripts in the teacher's voice
 * (we-not-you, normalize, hand-back-process, warm hedges), and it is the only
 * thing ever spoken for that diagnosis. Voice is fixed by construction.
 *
 * Rules:
 * - Every diagnosis links to a curriculum conceptId; where a registered
 *   curriculum misconception exists, it links to that too.
 * - `say` must never contain the target answer — the answer-leak guard
 *   (`assertNoAnswerLeak`) is enforced by tests over the whole catalogue.
 * - `none` is always selectable: silence is cheap, being wrong is not.
 */

export interface Diagnosis {
  id: string;
  /** Curriculum concept this diagnosis belongs to. */
  conceptId: string;
  /** Registered curriculum misconception, when one exists. */
  misconceptionId?: string;
  /** Shown to the model so it can choose. Describes the error, not the fix. */
  when: string;
  /** Only offered for spoken sessions; pronunciation diagnoses are meaningless against text. */
  spokenOnly?: boolean;
  /** Authored. Must never contain the answer (enforced by the leak guard). */
  say: string;
  /**
   * The target answers this diagnosis sits beside. The leak guard asserts
   * none of these appear (normalized) in `say`.
   */
  targets: string[];
}

export const DIAGNOSES: Diagnosis[] = [
  {
    id: 'english-sounds',
    conceptId: 'es-al-endings',
    when: 'They produced the right Spanish word but with English vowel sounds or English stress.',
    spokenOnly: true,
    say: 'You had a little bit of English slipping in there, on the vowels. But take it syllable by syllable, vowels as they are written, and we get there perfectly.',
    targets: ['normal', 'natural', 'total'],
  },
  {
    id: 'noun-for-verb',
    conceptId: 'es-ion-endings',
    misconceptionId: 'm-ion-noun-for-verb',
    when: 'They gave the -ción noun where the -ar verb was wanted (e.g. "cancelación" for "to cancel").',
    say: 'Ah, that is the noun coming through. We want the verb here. Go back to what we do with that ending: take the -ción off, put an R on the end, and there is your verb.',
    targets: ['cancelar', 'generar', 'preparar', 'cooperar', 'explorar'],
  },
  {
    id: 'verb-for-noun',
    conceptId: 'es-ion-endings',
    misconceptionId: 'm-ion-verb-for-noun',
    when: 'They gave the -ar verb where the -ción noun was wanted.',
    say: 'That is the verb, and here we want the thing itself, the noun. We go the other way this time: off with the -ar, and back on with the -ción.',
    targets: ['cancelación', 'generación', 'preparación'],
  },
  {
    id: 'conjugated-second-verb',
    conceptId: 'es-quiero-infinitive',
    misconceptionId: 'm-quiero-second-verb',
    when: 'They changed the ending on the second verb instead of leaving it in its base form (e.g. "quiero cancelo").',
    say: 'You moved that second verb, and that is English pulling at you - in English both parts feel like verbs. In Spanish only the first one moves. The second one just sits there in its base form.',
    targets: ['quiero cancelar', 'quiero preparar'],
  },
  {
    id: 'english-word-order',
    conceptId: 'es-quiero-infinitive',
    when: 'They used English word order, typically putting a small word after the verb instead of in front of it.',
    say: 'That is English word order slipping in. English puts that little word after, and Spanish puts it in front. The words were right - it is the order that moved.',
    targets: ['te quiero', 'no quiero'],
  },
  {
    id: 'reached-for-english',
    conceptId: 'es-al-endings',
    when: 'They said the ENGLISH word itself, unchanged, where the Spanish one was wanted. Only when the English source word is recognisably present.',
    say: 'English was shouting at you there, and many people at home will find themselves doing exactly that. Go back to the Spanish pattern we built and let that do the work.',
    targets: ['importante', 'normal', 'natural'],
  },
  {
    id: 'added-negation',
    conceptId: 'es-quiero-want',
    misconceptionId: 'm-quiero-negation-added',
    when: 'They added "no" when the sentence was not negative.',
    say: 'You slipped a no in front, and that flips the whole thing over - that is how we say we do not want something. Take it back out and say it straight.',
    targets: ['quiero', 'te quiero'],
  },
  {
    id: 'missing-negation',
    conceptId: 'es-quiero-want',
    misconceptionId: 'm-quiero-negation-missing',
    when: 'The sentence needed "no" and they left it out.',
    say: 'We are missing the no. In Spanish it parks straight in front of the verb, nice and simple - nothing else has to change.',
    targets: ['no quiero'],
  },
  {
    id: 'over-applied-rule',
    conceptId: 'es-ant-ent-endings',
    when: 'They applied a pattern too far, or applied it twice, producing a word that does not exist.',
    say: 'You took the pattern one step too far there, which honestly is a good sign - it means the rule is in. Just run it once and stop.',
    targets: ['importante', 'diferente'],
  },
  {
    id: 'wrong-ending',
    conceptId: 'es-ant-ent-endings',
    when: 'Right root, wrong ending - -ante for -ente, -able for -ible, or similar.',
    say: 'The word is right, it is just the ending that wandered. Go back to the pattern and listen for which one it takes.',
    targets: ['importante', 'diferente'],
  },
  {
    id: 'missing-piece',
    conceptId: 'es-quiero-infinitive',
    when: 'They left out a word the sentence needs.',
    say: 'We are a piece short there. Go back through what we are building: what does the sentence still need to stand up?',
    targets: ['quiero cancelar'],
  },
  {
    id: 'extra-piece',
    conceptId: 'es-quiero-infinitive',
    when: 'They added a word the sentence does not need.',
    say: 'There is one piece too many in there. Spanish is carrying more inside the verb than English does, so we need less than it feels like we do.',
    targets: ['quiero cancelar'],
  },
];

export function findDiagnosis(id: string): Diagnosis | undefined {
  return DIAGNOSES.find((d) => d.id === id);
}

/** Diagnoses applicable to one concept. */
export function diagnosesForConcept(conceptId: string): Diagnosis[] {
  return DIAGNOSES.filter((d) => d.conceptId === conceptId);
}

/**
 * The menu the reasoning model chooses from. `none` is always available and
 * always allowed — when nothing fits, the teacher stays silent rather than
 * guessing.
 */
export function diagnosisMenu(mode: 'spoken' | 'typed' = 'spoken'): string {
  return [
    ...DIAGNOSES.filter((d) => mode === 'spoken' || !d.spokenOnly).map(
      (d) => `${d.id}: ${d.when}`,
    ),
    'none: Nothing here fits what they did, or you are not confident.',
  ].join('\n');
}

export function isSelectable(id: string, mode: 'spoken' | 'typed'): boolean {
  if (id === 'none') return true;
  const d = findDiagnosis(id);
  return !!d && (mode === 'spoken' || !d.spokenOnly);
}

function normalizeForLeak(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Answer-leak guard: the authored correction must not contain any of its
 * target answers. The reveal delivers the answer a moment later; saying it in
 * the correction removes the last step the learner has to take.
 */
export function assertNoAnswerLeak(d: Diagnosis): string[] {
  const said = normalizeForLeak(d.say);
  return d.targets.filter((t) => {
    const norm = normalizeForLeak(t);
    return norm.length > 0 && said.includes(norm);
  });
}

/** Guard over the whole catalogue: every leak found, empty when clean. */
export function auditCatalogueLeaks(): Array<{ id: string; leaked: string[] }> {
  return DIAGNOSES.map((d) => ({ id: d.id, leaked: assertNoAnswerLeak(d) })).filter(
    (r) => r.leaked.length > 0,
  );
}
