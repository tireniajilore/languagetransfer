import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFeedbackPromptText } from '../src/lib/parse-transcript';
import type { RawLesson, SpeechSegment } from '../src/types/lesson';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

function formatLessonNumber(n: number) {
  return String(n).padStart(2, '0');
}

function readLesson(lessonNumber: number): RawLesson {
  const filePath = path.join(DATA_DIR, `lesson-${formatLessonNumber(lessonNumber)}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as RawLesson;
}

/**
 * Collect all Spanish phrases from student expected_answers across the lesson.
 * These are the canonical Spanish words/phrases we know appear in the lesson.
 */
function collectSpanishPhrases(lesson: RawLesson): string[] {
  const phrases: string[] = [];
  for (const turn of lesson.turns) {
    if (turn.speaker === 'student' && turn.expected_answers) {
      for (const answer of turn.expected_answers) {
        const cleaned = answer.replace(/[.!?,;:'"()]/g, '').trim().toLowerCase();
        if (cleaned) phrases.push(cleaned);
      }
    }
  }
  // Sort longest first so we match longer phrases before shorter ones
  return [...new Set(phrases)].sort((a, b) => b.length - a.length);
}

/**
 * Split tutor text into en/es segments by finding known Spanish phrases.
 * This handles the common patterns:
 *   - "Es importante. Good." → [es:"Es importante.", en:"Good."]
 *   - "The word for 'is' is es." → [en:"The word for 'is' is", es:"es."]
 */
function splitIntoSegments(text: string, spanishPhrases: string[]): SpeechSegment[] {
  if (!text.trim()) return [];

  // Build a list of Spanish spans found in the text
  const spans: Array<{ start: number; end: number }> = [];
  const lowerText = text.toLowerCase();

  for (const phrase of spanishPhrases) {
    // Skip very short phrases (1-2 chars) to avoid false matches
    if (phrase.length <= 2) continue;

    let searchFrom = 0;
    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(phrase, searchFrom);
      if (idx === -1) break;

      // Check word boundaries: the match should not be in the middle of a longer word
      const charBefore = idx > 0 ? lowerText[idx - 1] : ' ';
      const charAfter = idx + phrase.length < lowerText.length ? lowerText[idx + phrase.length] : ' ';
      const isWordBoundaryBefore = /[\s,.:;!?'"()\-]/.test(charBefore);
      const isWordBoundaryAfter = /[\s,.:;!?'"()\-]/.test(charAfter);

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        // Check this span doesn't overlap with an existing one
        const overlaps = spans.some(
          (s) => !(idx + phrase.length <= s.start || idx >= s.end)
        );
        if (!overlaps) {
          spans.push({ start: idx, end: idx + phrase.length });
        }
      }
      searchFrom = idx + 1;
    }
  }

  // Also match single known Spanish words that might be short (es, no, sí, etc.)
  const shortSpanishWords = ['es', 'no', 'sí', 'si'];
  for (const word of shortSpanishWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    let match;
    while ((match = regex.exec(lowerText)) !== null) {
      const idx = match.index;
      // Only match if it looks like it's being used as Spanish (at start of turn after feedback, or adjacent to other Spanish)
      const isNearSpanish = spans.some(
        (s) => Math.abs(s.start - idx) < 30 || Math.abs(s.end - idx) < 30
      );
      if (!isNearSpanish) continue;

      const overlaps = spans.some(
        (s) => !(idx + word.length <= s.start || idx >= s.end)
      );
      if (!overlaps) {
        spans.push({ start: idx, end: idx + word.length });
      }
    }
  }

  if (spans.length === 0) {
    return [{ text: text.trim(), lang: 'en' }];
  }

  // Sort spans by position
  spans.sort((a, b) => a.start - b.start);

  // Merge adjacent/overlapping spans
  const merged: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end + 2) {
      // Extend to include connecting punctuation/spaces
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }

  // Build segments from spans
  const segments: SpeechSegment[] = [];
  let pos = 0;

  for (const span of merged) {
    // Extend Spanish span to include trailing punctuation
    let spanEnd = span.end;
    while (spanEnd < text.length && /[.,;:!?]/.test(text[spanEnd])) {
      spanEnd++;
    }

    // English text before this Spanish span
    if (span.start > pos) {
      const enText = text.slice(pos, span.start).trim();
      if (enText) segments.push({ text: enText, lang: 'en' });
    }

    // Spanish span (use original casing from text)
    const esText = text.slice(span.start, spanEnd).trim();
    if (esText) segments.push({ text: esText, lang: 'es' });

    pos = spanEnd;
  }

  // Remaining English text
  if (pos < text.length) {
    const enText = text.slice(pos).trim();
    if (enText) segments.push({ text: enText, lang: 'en' });
  }

  // If we only found tiny Spanish fragments in a long English sentence,
  // it's probably better to just treat the whole thing as English
  const totalEs = segments.filter(s => s.lang === 'es').reduce((sum, s) => sum + s.text.length, 0);
  if (totalEs < 3 && text.length > 50) {
    return [{ text: text.trim(), lang: 'en' }];
  }

  return segments;
}

function buildSegmentMap(lesson: RawLesson): Record<string, SpeechSegment[]> {
  const spanishPhrases = collectSpanishPhrases(lesson);
  const entries: Record<string, SpeechSegment[]> = {};

  lesson.turns.forEach((turn, index) => {
    if (turn.speaker !== 'tutor' || !turn.text) return;

    const keyBase = `turn-${index + 1}`;

    if (turn.is_feedback && turn.is_prompt) {
      const { revealText, promptText, splitIndex } = splitFeedbackPromptText(turn.text);

      if (revealText) {
        const revealSegments = splitIntoSegments(revealText, spanishPhrases);
        if (revealSegments.length > 0) entries[`${keyBase}-reveal`] = revealSegments;
      }
      const effectivePrompt = promptText || turn.text;
      const promptSegments = splitIntoSegments(effectivePrompt, spanishPhrases);
      if (promptSegments.length > 0) entries[`${keyBase}-prompt`] = promptSegments;
    } else {
      const segments = splitIntoSegments(turn.text, spanishPhrases);
      if (segments.length > 0) entries[`${keyBase}-full`] = segments;
    }
  });

  // Outro segments (all English)
  lesson.outro?.forEach((entry, index) => {
    entries[`outro-${index + 1}-full`] = [{ text: entry.text.trim(), lang: 'en' }];
  });

  return entries;
}

function getAvailableLessons(): number[] {
  return readdirSync(DATA_DIR)
    .map((f) => f.match(/^lesson-(\d{2})\.json$/))
    .filter(Boolean)
    .map((m) => Number(m![1]))
    .sort((a, b) => a - b);
}

function parseArgs(args: string[]) {
  const lessons: number[] = [];
  let all = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') { all = true; continue; }
    if (arg === '--lesson') {
      lessons.push(Number(args[++i]));
    }
  }

  return { all, lessonNumbers: all ? getAvailableLessons() : lessons };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  for (const lessonNumber of args.lessonNumbers) {
    // Skip lesson 02 — it has hand-crafted segments
    if (lessonNumber === 2) {
      console.log(`Skipping lesson 2: hand-crafted segments preserved.`);
      continue;
    }

    const lesson = readLesson(lessonNumber);
    const segments = buildSegmentMap(lesson);
    const segmentsPath = path.join(DATA_DIR, `lesson-${formatLessonNumber(lessonNumber)}-segments.json`);
    await writeFile(segmentsPath, `${JSON.stringify(segments, null, 2)}\n`, 'utf8');
    console.log(`Wrote segments for lesson ${lessonNumber}: ${Object.keys(segments).length} entries`);
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
