// Quick A/B test: Brian on eleven_turbo_v2_5 with language_code, real words (no
// respelling). Outputs to out/tts-test/ and a concatenated _compare.mp3.
//   node scripts/tts-test.mjs            # turbo v2.5
//   node scripts/tts-test.mjs eleven_flash_v2_5
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.resolve(__dirname, '../../..', '.env')});

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error('no ELEVENLABS_API_KEY'); process.exit(1); }

const VOICE_ID = 'Czw3Dn181ypdrCOnPfif'; // Brian
const MODEL_ID = process.argv[2] || 'eleven_turbo_v2_5';
const OUT = path.join(__dirname, '..', 'out', 'tts-test');
fs.mkdirSync(OUT, {recursive: true});

// Real words only — language_code forces pronunciation, no phonetic respelling.
const clips = [
  {key: '01-en-metal', text: 'Metal.', lang: 'en'},
  {key: '02-es-metal', text: 'Metal.', lang: 'es'},
  {key: '03-en-natural', text: 'Natural.', lang: 'en'},
  {key: '04-es-natural', text: 'Natural.', lang: 'es'},
  {key: '05-en-legal', text: 'Legal.', lang: 'en'},
  {key: '06-es-legal', text: 'Legal.', lang: 'es'},
  {key: '07-en-sentence', text: 'Reading Spanish out loud is way easier than English.', lang: 'en'},
  {key: '08-es-sentence', text: 'Es normal. No es normal.', lang: 'es'},
];

async function synth({key, text, lang}) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify({text, model_id: MODEL_ID, language_code: lang, voice_settings: {stability: 0.5, similarity_boost: 0.8}}),
  });
  if (!res.ok) throw new Error(`[${key}] ${res.status}: ${(await res.text()).slice(0, 200)}`);
  fs.writeFileSync(path.join(OUT, `${key}.mp3`), Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${key}  (${lang})  "${text}"`);
}

console.log(`Brian · ${MODEL_ID} · ${clips.length} clips\n`);
for (const c of clips) {
  try { await synth(c); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
}
