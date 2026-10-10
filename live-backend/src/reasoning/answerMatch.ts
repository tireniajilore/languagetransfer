/**
 * Tri-state deterministic answer scoring (Layer C fast path).
 *
 * Ported from PR #11's `lt-runner/src/lib/answer-match.ts` (reviewed, not
 * merged — the port adapts it to the harness). The rule survives the port
 * unchanged because it is deliberately conservative:
 *
 * - `right`: the learner's utterance matches an expected answer.
 * - `wrong`: the learner was clearly attempting the target and missed.
 * - `unclear`: the utterance bears no resemblance to the target (STT failure,
 *   or they said something else entirely) — produces silence, never a bogus
 *   correction. A missed correction is invisible to the learner; a wrong one
 *   costs their trust.
 *
 * No model is consulted. This runs before any delegation.
 */

export type MatchOutcome = 'right' | 'wrong' | 'unclear';

export interface MatchResult {
  outcome: MatchOutcome;
  /** Normalized form of what we heard, for logging and diagnosis context. */
  heard: string;
  /** The accepted answer this was scored against (the closest one). */
  target?: string;
  /** 0 = identical, 1 = nothing in common. Only meaningful for right/wrong. */
  distance?: number;
}

// Beyond this ratio, the utterance is not an attempt at the target at all.
const UNCLEAR_ABOVE = 0.4;

// Flat ratios fail on short targets ("esta" vs "es" scores 0.50 on length
// alone). A shared prefix is the better attempt signal for short words.
const PREFIX_ATTEMPT = 3;

// Words that do not change meaning: hesitations and dropped subject pronouns
// Spanish normally omits ("yo quiero cancelar" is the emphatic form the course
// teaches). Deliberately excludes `no` — it flips meaning and must be scored
// as a real attempt.
const IGNORABLE = new Set([
  'um', 'uh', 'eh', 'er', 'hmm', 'ah', 'oh', 'okay', 'ok', 'so', 'well',
  'yo', 'i', 'think', 'its', 'is', 'it',
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

/**
 * Score a learner utterance against accepted answers. Never throws;
 * degrades to `unclear` on missing input rather than guessing.
 */
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
