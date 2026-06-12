// ElevenLabs TTS for a lesson script (segment-based).
//   node scripts/tts-lesson.mjs lesson-02-vowels
// Reads tiktok/scripts/<name>.json, synthesizes each segment.say to
// public/audio/<lesson.id>/seg-NN.mp3. Uses per-segment language tags so
// cognates can stay English in prompts and Spanish in reveals.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
dotenv.config({path: path.join(ROOT, '.env')});

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY missing from .env');
  process.exit(1);
}

const VOICE_ID = process.env.TTS_VOICE_ID || 'Czw3Dn181ypdrCOnPfif'; // Brian
const MODEL_ID = process.env.TTS_MODEL || 'eleven_v3';

const name = process.argv[2] || 'lesson-02-vowels';
// Optional segment indices to (re)synth just those, e.g. `... lesson-02-vowels 4 7`.
const only = process.argv.slice(3).map(Number).filter((n) => !Number.isNaN(n));
const lesson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', `${name}.json`), 'utf8'),
);
const OUT_DIR = path.join(__dirname, '..', 'public', 'audio', lesson.id);

const clips = lesson.segments
  .map((seg, i) => ({
    key: `seg-${String(i).padStart(2, '0')}`,
    text: seg.say,
    lang: seg.lang,
    i,
  }))
  .filter((c) => c.text && c.text.trim())
  .filter((c) => only.length === 0 || only.includes(c.i));

fs.mkdirSync(OUT_DIR, {recursive: true});

async function synth({key, text, lang}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const body = {
    text,
    model_id: MODEL_ID,
    voice_settings: {stability: 0.5, similarity_boost: 0.8},
  };
  if (lang) body.language_code = lang;
  const res = await fetch(url, {
    method: 'POST',
    headers: {'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`[${key}] ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, `${key}.mp3`), buf);
  console.log(`✓ ${key} ${lang ? `/${lang}` : '   '} ${(buf.length / 1024).toFixed(0)} KB  "${text.slice(0, 44)}"`);
}

console.log(`Lesson ${lesson.id} · voice ${VOICE_ID} · model ${MODEL_ID} · ${clips.length} clips\n`);
for (const c of clips) {
  try {
    await synth(c);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
}
