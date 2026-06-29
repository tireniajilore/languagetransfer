import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';
import { buildElevenLabsRequestBody, getElevenLabsVoiceId } from '../src/lib/elevenlabs-config';
import { getCognatesLessonBundle, getCognatesLessonIds } from '../src/data/cognates/adapter';
import { formatLessonNumber, getAvailableLessons, getLesson } from '../src/data/get-lesson';
import type { Lesson, SpeechSegment } from '../src/types/lesson';
import type { TTSManifest } from '../src/types/tts-manifest';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  const value = rawValue.replace(/^['"]|['"]$/g, '');
  return { key, value };
}

async function loadDotEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  if (!existsSync(envPath)) return;

  const envContents = await readFile(envPath, 'utf8');
  for (const line of envContents.split('\n')) {
    const parsed = parseEnvLine(line);
    if (!parsed || process.env[parsed.key]) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function hashSegment(segment: SpeechSegment) {
  return createHash('sha256').update(`${segment.text}|${segment.lang}`).digest('hex');
}

function buildFileName(sourceKey: string, index: number) {
  return `${sourceKey}-${index + 1}.mp3`;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readExistingManifest(manifestPath: string): Promise<TTSManifest | null> {
  if (!existsSync(manifestPath)) return null;

  try {
    const contents = await readFile(manifestPath, 'utf8');
    return JSON.parse(contents) as TTSManifest;
  } catch {
    return null;
  }
}

async function trimMp3Silence(filePath: string): Promise<void> {
  const tmpPath = filePath.replace(/\.mp3$/, '.trimmed.mp3');
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', filePath,
      '-af', [
        'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak',
        'aformat=dblp',
        'areverse',
        'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak',
        'aformat=dblp',
        'areverse'
      ].join(','),
      '-acodec', 'libmp3lame', '-q:a', '2',
      tmpPath
    ]);
    await rename(tmpPath, filePath);
  } catch {
    // ffmpeg unavailable or failed — keep original, skip trimming
    await unlink(tmpPath).catch(() => undefined);
  }
}

async function generateSegmentAudio(
  segment: SpeechSegment,
  destinationPath: string,
  apiKey: string
) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${getElevenLabsVoiceId()}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify(buildElevenLabsRequestBody(segment.text, segment.lang)),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `ElevenLabs request failed for "${segment.text}".`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, buffer);
  await trimMp3Silence(destinationPath);
}

async function uploadSegmentAudio(
  lessonId: string,
  fileName: string,
  destinationPath: string
) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return null;
  }

  const uploaded = await put(
    `audio/${lessonId}/${fileName}`,
    await readFile(destinationPath),
    {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'audio/mpeg',
      token
    }
  );

  return uploaded.url.replace(new RegExp(`/${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
}

async function generateLessonManifest(lesson: Lesson) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required to generate static TTS.');
  }

  const outputDir = path.join(publicRoot, 'audio', lesson.id);
  const manifestPath = path.join(outputDir, 'manifest.json');
  const existingManifest = await readExistingManifest(manifestPath);
  let baseUrl = process.env.TTS_BASE_URL?.replace(/\/$/, '')
    ?? existingManifest?.baseUrl;

  await mkdir(outputDir, { recursive: true });

  const entries: TTSManifest['entries'] = {};

  for (const step of lesson.steps) {
    if (!step.sourceKey) continue;

    const segments = step.segments?.length ? step.segments : [{ text: step.text, lang: 'en' as const }];
    const existingEntry = existingManifest?.entries[step.sourceKey];
    const manifestSegments = [];

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const hash = hashSegment(segment);
      const file = buildFileName(step.sourceKey, index);
      const destinationPath = path.join(outputDir, file);
      const existingSegment = existingEntry?.segments[index];
      const shouldReuse = existingSegment?.hash === hash && existsSync(destinationPath);

      if (!shouldReuse) {
        console.log(`Generating ${lesson.id} ${step.sourceKey} [${index + 1}/${segments.length}]`);
        await generateSegmentAudio(segment, destinationPath, apiKey);
        await delay(300);
      }

      const uploadedBaseUrl = await uploadSegmentAudio(lesson.id, file, destinationPath);
      baseUrl = uploadedBaseUrl ?? baseUrl;

      manifestSegments.push({
        ...segment,
        file,
        hash
      });
    }

    entries[step.sourceKey] = { segments: manifestSegments };
  }

  const manifest: TTSManifest = {
    lessonId: lesson.id,
    baseUrl,
    generatedAt: new Date().toISOString(),
    entries
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  await loadDotEnvLocal();
  await mkdir(publicRoot, { recursive: true });
  const targets = parseTargets(process.argv.slice(2));

  for (let index = 0; index < targets.length; index += 1) {
    await generateLessonManifest(targets[index]);

    if (index < targets.length - 1) {
      await delay(5000);
    }
  }
}

function getCognatesLesson(lessonId: string) {
  const bundle = getCognatesLessonBundle(lessonId);
  if (!bundle) {
    throw new Error(`Unknown cognates lesson: ${lessonId}`);
  }

  return bundle.lesson;
}

function parseTargets(args: string[]) {
  const availableLessons = new Set(getAvailableLessons());
  const availableCognatesLessons = new Set(getCognatesLessonIds());
  const lessons: Lesson[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--all') {
      return [...availableLessons]
        .sort((a, b) => a - b)
        .map((lessonNumber) => getLesson(lessonNumber));
    }

    if (arg === '--lesson') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || !availableLessons.has(value)) {
        throw new Error(`Unknown lesson: ${args[index + 1] ?? '(missing)'}`);
      }

      lessons.push(getLesson(value));
      index += 1;
    }

    if (arg === '--cognates') {
      return [...availableCognatesLessons]
        .map((lessonId) => getCognatesLesson(lessonId));
    }

    if (arg === '--cognates-lesson') {
      const lessonId = args[index + 1];
      if (!lessonId || !availableCognatesLessons.has(lessonId)) {
        throw new Error(`Unknown cognates lesson: ${lessonId ?? '(missing)'}`);
      }

      lessons.push(getCognatesLesson(lessonId));
      index += 1;
    }
  }

  return lessons.length > 0 ? lessons : [getLesson(2)];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
