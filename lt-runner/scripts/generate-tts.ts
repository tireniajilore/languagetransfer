import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildElevenLabsRequestBody, getElevenLabsVoiceId } from '../src/lib/elevenlabs-config';
import { lesson02 } from '../src/data/lesson-02';
import type { SpeechSegment } from '../src/types/lesson';
import type { TTSManifest } from '../src/types/tts-manifest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');

const LESSONS = [lesson02];

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
}

async function generateLessonManifest(lessonId: string) {
  const lesson = LESSONS.find((entry) => entry.id === lessonId);
  if (!lesson) {
    throw new Error(`Unknown lesson: ${lessonId}`);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required to generate static TTS.');
  }

  const outputDir = path.join(publicRoot, 'audio', lesson.id);
  const manifestPath = path.join(outputDir, 'manifest.json');
  const existingManifest = await readExistingManifest(manifestPath);

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
    generatedAt: new Date().toISOString(),
    entries
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  await loadDotEnvLocal();
  await mkdir(publicRoot, { recursive: true });

  await generateLessonManifest('lesson-02');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
