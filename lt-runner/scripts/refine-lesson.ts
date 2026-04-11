import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { formatLessonNumber } from '../src/data/get-lesson';
import type { RawLesson } from '../src/types/lesson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const DATA_DIR = path.join(projectRoot, 'src', 'data');

function loadDotEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function readLesson(lessonNumber: number): RawLesson {
  const filePath = path.join(DATA_DIR, `lesson-${formatLessonNumber(lessonNumber)}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as RawLesson;
}

const REFERENCE_LESSON = readFileSync(
  path.join(DATA_DIR, 'lesson-02.json'),
  'utf8'
);

const SYSTEM_PROMPT = `You are an expert instructional designer adapting Language Transfer Spanish transcripts into a concise, interactive app format.

You will receive a raw lesson JSON parsed from a PDF transcript. Your job is to refine it to match the quality of the reference lesson below.

## Reference lesson (lesson 02 — the gold standard):
${REFERENCE_LESSON}

## What makes the reference lesson good:
1. **Trimmed filler**: No conversational tangents, no "whoever said Latin is a dead language", no meta-commentary about the learning process.
2. **No meta-conversation**: When the PDF has the teacher asking "what do you notice?" followed by student guessing and teacher clarifying — collapse that into a direct instruction.
3. **Concise feedback**: "Good." or "Perfect." — not "Yeah, that's right, very good, and you pronounced an s which is excellent."
4. **Every prompt builds on the last**: Clear skill ladder. Each new word or structure adds something the previous one didn't.
5. **Cut redundant drill words**: If 3 words all test the same pattern with no new concept, keep the best 1-2 and cut the rest.
6. **Clean expected_answers**: Lowercase Spanish text, include common phonetic variants.
7. **Proper punctuation**: Quotes around English glosses ('is', 'not'), clean sentence structure.

## Rules:
- Output valid JSON matching the exact RawLesson schema (lesson_number, title, description, turns array, optional outro).
- Keep the lesson_number unchanged.
- Generate a short, descriptive title (like "Latin Cognates - AL Endings").
- Generate a one-line description summarizing what the lesson teaches.
- Preserve the teaching sequence and all concepts. Never remove a concept, only trim redundant repetition.
- For tutor turns: set is_prompt and is_feedback booleans correctly.
  - is_feedback: true when the turn follows a student answer (starts with the answer, then explains)
  - is_prompt: true when the next turn is a student response
  - A turn can be both is_feedback and is_prompt (feedback + new question in same turn)
- For student turns: only have expected_answers (array of strings). Include the primary answer and reasonable variants.
- Collapse multi-turn meta-conversations (teacher asks what student noticed, student guesses, teacher corrects) into a single clean instruction.
- Remove the student's mistakes and teacher corrections about those mistakes UNLESS the mistake teaches something valuable (like a common pronunciation error).
- Add an outro array with 2-4 entries that summarize what was learned and encourage practice, similar to lesson 02's outro.
- Do NOT add content that wasn't in the original lesson. The outro is the only exception.
- Keep Spanish words/phrases exactly as they appear in the original (don't change the Spanish).

Output ONLY the JSON, no markdown fences, no explanation.`;

async function refineLesson(
  client: OpenAI,
  rawLesson: RawLesson
): Promise<RawLesson> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 16000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Refine this lesson JSON:\n\n${JSON.stringify(rawLesson, null, 2)}`
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const cleaned = content.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const refined = JSON.parse(cleaned) as RawLesson;
    refined.lesson_number = rawLesson.lesson_number;
    return refined;
  } catch (error) {
    console.error('Failed to parse LLM response. First 500 chars:', cleaned.slice(0, 500));
    throw error;
  }
}

function parseArgs(args: string[]) {
  const lessons: number[] = [];
  let all = false;
  let force = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') { all = true; continue; }
    if (arg === '--force') { force = true; continue; }
    if (arg === '--dry-run') { dryRun = true; continue; }
    if (arg === '--lesson') {
      const v = Number(args[i + 1]);
      if (!Number.isInteger(v)) throw new Error(`Invalid lesson: ${args[i + 1]}`);
      lessons.push(v);
      i++;
    }
  }

  if (!all && lessons.length === 0) {
    throw new Error('Use --lesson N or --all');
  }

  return { all, force, dryRun, lessonNumbers: lessons };
}

function getAvailableRawLessons(): number[] {
  return readdirSync(DATA_DIR)
    .map((f) => {
      const m = f.match(/^lesson-(\d{2})\.json$/);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null && n !== 2)
    .sort((a, b) => a - b);
}

async function main() {
  loadDotEnvLocal();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required in .env.local');

  const client = new OpenAI({ apiKey });
  const args = parseArgs(process.argv.slice(2));
  const lessonNumbers = args.all ? getAvailableRawLessons() : args.lessonNumbers.filter(n => n !== 2);

  console.log(`Refining ${lessonNumbers.length} lessons: ${lessonNumbers.join(', ')}`);

  for (const lessonNumber of lessonNumbers) {
    const suffix = formatLessonNumber(lessonNumber);
    const lessonPath = path.join(DATA_DIR, `lesson-${suffix}.json`);

    if (!existsSync(lessonPath)) {
      console.warn(`Skipping lesson ${lessonNumber}: no JSON file found.`);
      continue;
    }

    const rawLesson = readLesson(lessonNumber);

    // Skip if already has a real title (already refined) unless --force
    if (!args.force && rawLesson.title && !rawLesson.title.startsWith('Lesson ')) {
      console.log(`Skipping lesson ${lessonNumber}: already refined. Use --force to re-refine.`);
      continue;
    }

    console.log(`Refining lesson ${lessonNumber}...`);
    const refined = await refineLesson(client, rawLesson);

    if (args.dryRun) {
      console.log(JSON.stringify(refined, null, 2));
      continue;
    }

    await writeFile(lessonPath, `${JSON.stringify(refined, null, 2)}\n`, 'utf8');
    console.log(`Wrote refined lesson ${lessonNumber}: ${lessonPath}`);

    // Brief delay between API calls
    if (lessonNumbers.indexOf(lessonNumber) < lessonNumbers.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
