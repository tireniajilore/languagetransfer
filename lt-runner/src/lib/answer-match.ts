// Decide whether a spoken answer was right, wrong, or not worth judging.
//
// The engine has never had a notion of "correct" — it records `acceptedAnswers`
// on every response and never compares anything. This is that comparison, and it
// is deliberately generous, because both failure modes we measured were FALSE
// corrections: a model affirmed a wrong answer, and corrected a right one.
//
// Three outcomes, not two. `unclear` exists so that a transcript which bears no
// resemblance to the target (STT failure, or the learner said something else
// entirely) produces silence rather than a bogus correction. A missed correction
// is invisible to the learner. A wrong one costs their trust.

export type MatchOutcome = 'right' | 'wrong' | 'unclear';

export interface MatchResult {
  outcome: MatchOutcome;
  /** Normalized form of what we heard, for logging and for the correction prompt. */
  heard: string;
  /** The accepted answer this was scored against (the closest one). */
  target?: string;
  /** 0 = identical, 1 = nothing in common. Only meaningful for right/wrong. */
  distance?: number;
}

// Anything beyond this and we assume it is not an attempt at the target at all.
const UNCLEAR_ABOVE = 0.4;

// A flat distance ratio does not survive short answers: "esta" against "es" scores
// 0.50 purely because the target is two letters, which would drop the single most
// common Spanish learner error on the floor. A shared prefix is the better signal
// that the learner was reaching for THIS word — "generacionar"/"generar" share six
// characters, while "cancelar"/"generar" share none.
const PREFIX_ATTEMPT = 3;

// Words a learner can add without changing what they said. Hesitations, and the
// subject pronouns Spanish normally drops — "yo quiero cancelar" is correct, and
// is exactly the emphatic form the course teaches. Deliberately does NOT include
// anything that changes meaning: `no` flips the sentence, so it must fall through
// to distance scoring and be treated as a real (wrong) attempt.
const IGNORABLE = new Set([
  'um', 'uh', 'eh', 'er', 'hmm', 'ah', 'oh', 'okay', 'ok', 'so', 'well',
  'yo', 'i', 'think', 'its', 'is', 'it'
]);

export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: canción -> cancion
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Drop hesitations and dropped-pronoun noise from both ends, so "um, yo quiero
// cancelar" scores against "quiero cancelar" rather than being penalised for it.
function stripIgnorable(text: string): string {
  const words = text.split(' ').filter(Boolean);
  let start = 0;
  let end = words.length;
  while (start < end && IGNORABLE.has(words[start])) start += 1;
  while (end > start && IGNORABLE.has(words[end - 1])) end -= 1;
  return words.slice(start, end).join(' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function commonPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

// Did they reach for this word and miss, or say something else entirely?
function looksLikeAnAttempt(heard: string, target: string, distanceRatio: number): boolean {
  if (distanceRatio <= UNCLEAR_ABOVE) return true;
  const prefix = commonPrefix(heard, target);
  const shorter = Math.min(heard.length, target.length);
  return prefix >= PREFIX_ATTEMPT || prefix >= Math.ceil(shorter / 2);
}

function ratio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : levenshtein(a, b) / longest;
}

export function matchAnswer(spoken: string, acceptedAnswers: string[] = []): MatchResult {
  const heard = stripIgnorable(normalize(spoken));

  // Nothing to compare against, or nothing said. Never correct on no evidence.
  if (!heard || acceptedAnswers.length === 0) {
    return { outcome: 'unclear', heard };
  }

  let best: { target: string; distance: number } | null = null;
  for (const answer of acceptedAnswers) {
    const target = stripIgnorable(normalize(answer));
    if (!target) continue;
    const distance = ratio(heard, target);
    if (!best || distance < best.distance) best = { target, distance };
  }

  if (!best) return { outcome: 'unclear', heard };

  if (best.distance === 0) {
    return { outcome: 'right', heard, target: best.target, distance: 0 };
  }
  if (looksLikeAnAttempt(heard, best.target, best.distance)) {
    return { outcome: 'wrong', heard, target: best.target, distance: best.distance };
  }
  return { outcome: 'unclear', heard, target: best.target, distance: best.distance };
}
