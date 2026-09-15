// The closed set of things that go wrong, and what the teacher says about each.
//
// Why a catalogue rather than free generation: a model asked to write a correction
// produces clinically correct prose in the wrong voice ("This slip came from mixing
// the noun form with the verb form") and gets the diagnosis right about half the
// time. Asked instead to PICK from a list, it does the part it is good at
// (classification) and never writes a word the learner hears.
//
// So the model chooses an id. The text below is authored, and it is the only thing
// ever spoken. Voice is fixed by construction.
//
// The phrasing is mined from the 90 transcripts. Mihalis's correction signature:
//   - "we", not "you" — the mistake is something we are looking at together
//   - normalise it: "many people at home will find themselves doing this"
//   - "we don't want that" rather than "that's wrong"; no verdict, ever
//   - always hand back a process: "go back to", "take it syllable by syllable"
//   - warm hedges: "a little bit", "kind of", "right?"
//
// DRAFTS. These are written in his voice, not lifted from it, except where noted.
// They need a pass from someone who has listened to the whole course.

export interface Diagnosis {
  id: string;
  /** Shown to the model so it can choose. Describes the learner's error, not the fix. */
  when: string;
  /**
   * Only offered when the learner SPOKE. A pronunciation diagnosis is meaningless
   * against typed text, and offering it invites the model to reach for it.
   */
  spokenOnly?: boolean;
  /**
   * What the teacher says. Authored, never generated.
   * Must never contain the answer — the reveal delivers that a moment later, and
   * saying it here removes the last step the learner has to take.
   */
  say: string;
}

export const DIAGNOSES: Diagnosis[] = [
  {
    id: 'english-sounds',
    when: 'They produced the right Spanish word but with English vowel sounds or English stress.',
    spokenOnly: true,
    // Close to verbatim, Complete Spanish lesson 4.
    say: "You had a little bit of English slipping in there, on the vowels. But take it syllable by syllable, vowels as they're written, and we get there perfectly."
  },
  {
    id: 'noun-for-verb',
    when: 'They gave the -ción noun where the -ar verb was wanted (e.g. "cancelación" for "to cancel").',
    say: "Ah, that's the noun coming through. We want the verb here. Go back to what we do with that ending: take the -ción off, put an R on the end, and there's your verb."
  },
  {
    id: 'verb-for-noun',
    when: 'They gave the -ar verb where the -ción noun was wanted.',
    say: "That's the verb, and here we want the thing itself, the noun. We go the other way this time: off with the -ar, and back on with the -ción."
  },
  {
    id: 'conjugated-second-verb',
    when: 'They changed the ending on the second verb instead of leaving it in its base form (e.g. "quiero cancelo").',
    say: "You moved that second verb, and that's English pulling at you — in English both parts feel like verbs. In Spanish only the first one moves. The second one just sits there in its base form."
  },
  {
    id: 'english-word-order',
    when: 'They used English word order, typically putting a small word after the verb instead of in front of it.',
    say: "That's English word order slipping in. English puts that little word after, and Spanish puts it in front. The words were right — it's the order that moved."
  },
  {
    id: 'reached-for-english',
    when: 'They said the ENGLISH word itself, unchanged, where the Spanish one was wanted (e.g. "important" for "importante", "cancel" for "cancelar"). Only when the English source word is recognisably present.',
    say: "English was shouting at you there, and many people at home will find themselves doing exactly that. Go back to the Spanish pattern we built and let that do the work."
  },
  {
    id: 'added-negation',
    when: 'They added "no" when the sentence was not negative.',
    say: "You slipped a no in front, and that flips the whole thing over — that's how we say we don't want something. Take it back out and say it straight."
  },
  {
    id: 'missing-negation',
    when: 'The sentence needed "no" and they left it out.',
    say: "We're missing the no. In Spanish it parks straight in front of the verb, nice and simple — nothing else has to change."
  },
  {
    id: 'over-applied-rule',
    when: 'They applied a pattern too far, or applied it twice, producing a word that does not exist.',
    say: "You took the pattern one step too far there, which honestly is a good sign — it means the rule is in. Just run it once and stop."
  },
  {
    id: 'wrong-ending',
    when: 'Right root, wrong ending — -ante for -ente, -able for -ible, or similar.',
    say: "The word is right, it's just the ending that wandered. Go back to the pattern and listen for which one it takes."
  },
  {
    id: 'missing-piece',
    when: 'They left out a word the sentence needs.',
    say: "We're a piece short there. Go back through what we're building: what does the sentence still need to stand up?"
  },
  {
    id: 'extra-piece',
    when: 'They added a word the sentence does not need.',
    say: "There's one piece too many in there. Spanish is carrying more inside the verb than English does, so we need less than it feels like we do."
  }
];

export function findDiagnosis(id: string): Diagnosis | undefined {
  return DIAGNOSES.find(d => d.id === id);
}

/** The menu the model chooses from. `none` is always available and always allowed. */
export function diagnosisMenu(mode: 'spoken' | 'typed' = 'typed'): string {
  return [
    ...DIAGNOSES.filter(d => mode === 'spoken' || !d.spokenOnly).map(d => `${d.id}: ${d.when}`),
    'none: Nothing here fits what they did, or you are not confident.'
  ].join('\n');
}

export function isSelectable(id: string, mode: 'spoken' | 'typed'): boolean {
  const d = findDiagnosis(id);
  return !!d && (mode === 'spoken' || !d.spokenOnly);
}
