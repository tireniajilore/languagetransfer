// A/B listening test for Lesson 2 TTS modes.
//
// Outputs:
//   out/tts-ab-modes/brian-turbo.mp3
//   out/tts-ab-modes/two-voice-turbo.mp3
//
// Mode A: Brian for all segments, turbo v2.5, per-segment language_code.
// Mode B: Brian for English, Spanish voice for Spanish segments, turbo v2.5,
//         per-segment language_code.
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

const lessonName = process.argv[2] || 'lesson-02-vowels';
const MODEL_ID = process.env.TTS_AB_MODEL || process.argv[3] || 'eleven_turbo_v2_5';
const modelSlug = MODEL_ID.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const BRIAN_VOICE_ID = process.env.TTS_BRIAN_VOICE_ID || 'Czw3Dn181ypdrCOnPfif';
const SPANISH_VOICE_ID = process.env.TTS_SPANISH_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

const lesson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', `${lessonName}.json`), 'utf8'),
);

const OUT = path.join(__dirname, '..', 'out', 'tts-ab-modes');
const A_DIR = path.join(OUT, `segments-brian-${modelSlug}`);
const B_DIR = path.join(OUT, `segments-two-voice-${modelSlug}`);
fs.mkdirSync(A_DIR, {recursive: true});
fs.mkdirSync(B_DIR, {recursive: true});

const spokenSegments = lesson.segments
  .map((seg, i) => ({
    i,
    key: `seg-${String(i).padStart(2, '0')}`,
    text: seg.say,
    lang: seg.lang || 'en',
    kind: seg.kind,
  }))
  .filter((seg) => seg.text && seg.text.trim());
const oneVoiceOnly = process.argv.includes('--one-voice');

async function synth({dest, text, lang, voiceId}) {
  if (fs.existsSync(dest)) {
    return fs.readFileSync(dest);
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        language_code: lang,
        voice_settings: {stability: 0.5, similarity_boost: 0.8},
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf;
}

async function synthMode({modeName, outDir, selectVoice}) {
  const paths = [];
  console.log(`\n${modeName}`);
  for (const seg of spokenSegments) {
    const voiceId = selectVoice(seg);
    const dest = path.join(outDir, `${seg.key}-${seg.lang}.mp3`);
    const buf = await synth({dest, text: seg.text, lang: seg.lang, voiceId});
    paths.push(dest);
    console.log(
      `✓ ${seg.key} /${seg.lang} ${voiceId === BRIAN_VOICE_ID ? 'Brian' : 'Spanish'} ${String(
        Math.round(buf.length / 1024),
      ).padStart(4)} KB  "${seg.text.slice(0, 54)}"`,
    );
  }
  return paths;
}

function parseWav(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a WAV file: ${filePath}`);
  }

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

function parseFmt(fmt) {
  return {
    audioFormat: fmt.readUInt16LE(0),
    channels: fmt.readUInt16LE(2),
    sampleRate: fmt.readUInt32LE(4),
    bitsPerSample: fmt.readUInt16LE(14),
  };
}

function writeWav(filePath, fmt, dataBuffers) {
  const dataSize = dataBuffers.reduce((sum, b) => sum + b.length, 0);
  const riffSize = 4 + (8 + fmt.length) + (8 + dataSize);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUInt32LE(riffSize, 4);
  header.write('WAVE', 8);

  const fmtHeader = Buffer.alloc(8);
  fmtHeader.write('fmt ', 0);
  fmtHeader.writeUInt32LE(fmt.length, 4);

  const dataHeader = Buffer.alloc(8);
  dataHeader.write('data', 0);
  dataHeader.writeUInt32LE(dataSize, 4);

  fs.writeFileSync(filePath, Buffer.concat([header, fmtHeader, fmt, dataHeader, ...dataBuffers]));
}

function stitchMp3({name, segmentPaths}) {
  const workDir = path.join(OUT, `work-${name}`);
  fs.mkdirSync(workDir, {recursive: true});

  const wavs = segmentPaths.map((mp3, i) => {
    const wav = path.join(workDir, `${String(i).padStart(2, '0')}.wav`);
    execFileSync('afconvert', [mp3, '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', wav]);
    return wav;
  });

  const parsed = wavs.map(parseWav);
  const fmt = parsed[0].fmt;
  const format = parseFmt(fmt);
  if (format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    throw new Error(`Expected mono 16-bit PCM WAV, got ${JSON.stringify(format)}`);
  }
  for (const [i, p] of parsed.entries()) {
    if (!p.fmt.equals(fmt)) throw new Error(`WAV format mismatch at segment ${i}`);
  }

  const combinedWav = path.join(workDir, `${name}.wav`);
  const combinedMp3 = path.join(OUT, `${name}.mp3`);
  const dataBuffers = parsed.map((p) => p.data);
  writeWav(combinedWav, fmt, dataBuffers);

  const pcm = Buffer.concat(dataBuffers);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const encoder = new lamejs.Mp3Encoder(format.channels, format.sampleRate, 128);
  const mp3Chunks = [];
  const sampleBlockSize = 1152;
  for (let i = 0; i < samples.length; i += sampleBlockSize) {
    const block = samples.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(block);
    if (mp3buf.length > 0) mp3Chunks.push(Buffer.from(mp3buf));
  }
  const end = encoder.flush();
  if (end.length > 0) mp3Chunks.push(Buffer.from(end));
  fs.writeFileSync(combinedMp3, Buffer.concat(mp3Chunks));
  return combinedMp3;
}

const brianTurboPaths = await synthMode({
  modeName: `A. Brian ${MODEL_ID}, one voice`,
  outDir: A_DIR,
  selectVoice: () => BRIAN_VOICE_ID,
});

const aFile = stitchMp3({name: `brian-${modelSlug}`, segmentPaths: brianTurboPaths});
let bFile = null;
if (!oneVoiceOnly) {
  const twoVoiceTurboPaths = await synthMode({
    modeName: 'B. Two voice',
    outDir: B_DIR,
    selectVoice: (seg) => (seg.lang === 'es' ? SPANISH_VOICE_ID : BRIAN_VOICE_ID),
  });
  bFile = stitchMp3({name: `two-voice-${modelSlug}`, segmentPaths: twoVoiceTurboPaths});
}

fs.writeFileSync(
  path.join(OUT, 'README.txt'),
  [
    `Generated: ${new Date().toISOString()}`,
    `Lesson: ${lessonName}`,
    `Model: ${MODEL_ID}`,
    `Brian voice: ${BRIAN_VOICE_ID}`,
    `Spanish voice: ${SPANISH_VOICE_ID}`,
    '',
    `A. brian-${modelSlug}.mp3`,
    'Brian handles English and Spanish segments. Every segment still gets language_code.',
    '',
    ...(bFile
      ? [
          `B. two-voice-${modelSlug}.mp3`,
          'Brian handles English segments. The Spanish voice handles lang=es segments.',
          '',
        ]
      : []),
    'Segment order:',
    ...spokenSegments.map(
      (seg) => `${seg.key} /${seg.lang} ${seg.kind}: ${seg.text}`,
    ),
    '',
  ].join('\n'),
  'utf8',
);

console.log(`\nWrote:\n${[aFile, bFile].filter(Boolean).join('\n')}\n`);
