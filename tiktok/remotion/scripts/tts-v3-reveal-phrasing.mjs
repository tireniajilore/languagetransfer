// Brian v3 test for reveal phrasing:
// "Good, in Spanish: legal." vs "En español, legal."
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
globalThis.MPEGMode = require('lamejs/src/js/MPEGMode.js');
globalThis.Lame = require('lamejs/src/js/Lame.js');
globalThis.BitStream = require('lamejs/src/js/BitStream.js');
const lamejs = require('lamejs');

const ROOT = path.resolve(__dirname, '../../..');
dotenv.config({path: path.join(ROOT, '.env')});
dotenv.config({path: path.join(ROOT, 'lt-runner', '.env.local')});

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY missing from .env or lt-runner/.env.local');
  process.exit(1);
}

const VOICE_ID = process.env.TTS_BRIAN_VOICE_ID || 'Czw3Dn181ypdrCOnPfif';
const MODEL_ID = 'eleven_v3';
const OUT = path.join(__dirname, '..', 'out', 'tts-v3-reveal-phrasing');
const SEG_DIR = path.join(OUT, 'segments');
const WORK_DIR = path.join(OUT, 'work');
fs.mkdirSync(SEG_DIR, {recursive: true});
fs.mkdirSync(WORK_DIR, {recursive: true});

const clips = [
  {key: '01-control-legal', lang: 'es', text: 'En español, legal.'},
  {key: '02-good-in-spanish-legal', lang: 'es', text: 'Good, in Spanish: legal.'},
  {key: '03-good-in-spanish-metal', lang: 'es', text: 'Good, in Spanish: metal.'},
  {key: '04-good-in-spanish-natural', lang: 'es', text: 'Good, in Spanish: natural.'},
  {key: '05-good-in-spanish-ideal', lang: 'es', text: 'Good, in Spanish: ideal.'},
  {key: '06-english-anchor-legal', lang: 'en', text: 'What about the English word legal?'},
  {key: '07-reveal-after-anchor', lang: 'es', text: 'Good, in Spanish: legal.'},
];

async function synth(clip) {
  const dest = path.join(SEG_DIR, `${clip.key}.mp3`);
  if (fs.existsSync(dest)) return dest;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
      body: JSON.stringify({
        text: clip.text,
        model_id: MODEL_ID,
        language_code: clip.lang,
        voice_settings: {stability: 0.5, similarity_boost: 0.8},
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`[${clip.key}] ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function parseWav(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (id === 'fmt ') fmt = buf.subarray(start, end);
    if (id === 'data') data = buf.subarray(start, end);
    offset = end + (size % 2);
  }
  if (!fmt || !data) throw new Error(`Missing fmt/data chunk: ${filePath}`);
  return {fmt, data};
}

function writeMp3(name, segmentPaths) {
  const wavs = segmentPaths.map((mp3, i) => {
    const wav = path.join(WORK_DIR, `${String(i).padStart(2, '0')}.wav`);
    execFileSync('afconvert', [mp3, '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', wav]);
    return wav;
  });
  const parsed = wavs.map(parseWav);
  const pcm = Buffer.concat(parsed.map((p) => p.data));
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const encoder = new lamejs.Mp3Encoder(1, 44100, 128);
  const chunks = [];
  for (let i = 0; i < samples.length; i += 1152) {
    const mp3buf = encoder.encodeBuffer(samples.subarray(i, i + 1152));
    if (mp3buf.length) chunks.push(Buffer.from(mp3buf));
  }
  const end = encoder.flush();
  if (end.length) chunks.push(Buffer.from(end));
  const dest = path.join(OUT, `${name}.mp3`);
  fs.writeFileSync(dest, Buffer.concat(chunks));
  return dest;
}

const paths = [];
console.log(`Brian · ${MODEL_ID} reveal phrasing test\n`);
for (const clip of clips) {
  const dest = await synth(clip);
  paths.push(dest);
  const size = Math.round(fs.statSync(dest).size / 1024);
  console.log(`✓ ${clip.key} /${clip.lang} ${String(size).padStart(4)} KB  "${clip.text}"`);
}

const combined = writeMp3('brian-v3-reveal-phrasing', paths);
fs.writeFileSync(
  path.join(OUT, 'README.txt'),
  [
    `Generated: ${new Date().toISOString()}`,
    `Voice: Brian (${VOICE_ID})`,
    `Model: ${MODEL_ID}`,
    '',
    'Question: does "Good, in Spanish: X" keep the cognate Spanish and flow better?',
    '',
    'Clip order:',
    ...clips.map((c) => `${c.key} /${c.lang}: ${c.text}`),
    '',
  ].join('\n'),
  'utf8',
);

console.log(`\nWrote:\n${combined}\n`);
