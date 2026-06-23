import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Language = 'en' | 'es';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'public', 'voice-tests');

const MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_TEXT =
  'Think it through slowly. How would you say: I want to eat something today?';

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

function readArg(name: string) {
  const prefix = `--${name}=`;
  const inlineValue = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineValue) return inlineValue.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function splitList(value: string | undefined) {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function printUsage() {
  console.log(`
Usage:
  npm run test-voices -- --voices Rachel,Adam
  npm run test-voices -- --voices 21m00Tcm4TlvDq8ikWAM,pNInz6obpgDQGcFmaJgB
  npm run test-voices -- --list

Options:
  --voices   Comma-separated ElevenLabs voice names or voice IDs.
  --text     Sample text to render.
  --lang     en or es. Defaults to en.
  --speed    Voice speed. Defaults to 1.0.
  --list     Print available ElevenLabs voices and exit.

Output:
  public/voice-tests/<timestamp>/*.mp3
`);
}

async function fetchVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Unable to fetch ElevenLabs voices.');
  }

  const body = (await response.json()) as { voices?: ElevenLabsVoice[] };
  return body.voices ?? [];
}

function resolveRequestedVoices(availableVoices: ElevenLabsVoice[], requested: string[]) {
  return requested.map((requestedVoice) => {
    const byId = availableVoices.find((voice) => voice.voice_id === requestedVoice);
    if (byId) return byId;

    const byName = availableVoices.find(
      (voice) => voice.name.toLowerCase() === requestedVoice.toLowerCase()
    );
    if (byName) return byName;

    return {
      voice_id: requestedVoice,
      name: requestedVoice
    };
  });
}

async function generateSample(
  apiKey: string,
  voice: ElevenLabsVoice,
  text: string,
  lang: Language,
  speed: number,
  destinationPath: string
) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed
        },
        ...(lang === 'es' ? { language_code: 'es' } : {})
      }),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Unable to generate sample for ${voice.name}.`);
  }

  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  if (hasFlag('help')) {
    printUsage();
    return;
  }

  await loadDotEnvLocal();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required. Add it to lt-runner/.env.local first.');
  }

  const voices = await fetchVoices(apiKey);

  if (hasFlag('list')) {
    for (const voice of voices.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`${voice.name}: ${voice.voice_id}`);
    }
    return;
  }

  const requestedVoices = splitList(readArg('voices'));
  if (requestedVoices.length === 0) {
    printUsage();
    throw new Error('Pass at least one voice with --voices.');
  }

  const text = readArg('text') ?? DEFAULT_TEXT;
  const rawLang = readArg('lang') ?? 'en';
  const lang: Language = rawLang === 'es' ? 'es' : 'en';
  const parsedSpeed = Number.parseFloat(readArg('speed') ?? '1');
  const speed = Number.isFinite(parsedSpeed) && parsedSpeed > 0 ? parsedSpeed : 1;
  const resolvedVoices = resolveRequestedVoices(voices, requestedVoices);

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(outputRoot, runId);
  await mkdir(outputDir, { recursive: true });

  for (const voice of resolvedVoices) {
    const fileName = `${slugify(voice.name)}-${voice.voice_id}-${lang}.mp3`;
    const destinationPath = path.join(outputDir, fileName);
    console.log(`Generating ${voice.name} (${voice.voice_id})...`);
    await generateSample(apiKey, voice, text, lang, speed, destinationPath);
  }

  await writeFile(
    path.join(outputDir, 'README.txt'),
    [
      `Generated: ${new Date().toISOString()}`,
      `Model: ${MODEL_ID}`,
      `Language: ${lang}`,
      `Speed: ${speed}`,
      `Text: ${text}`,
      '',
      ...resolvedVoices.map((voice) => `${voice.name}: ${voice.voice_id}`)
    ].join('\n'),
    'utf8'
  );

  console.log(`Done. Samples saved to ${outputDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
