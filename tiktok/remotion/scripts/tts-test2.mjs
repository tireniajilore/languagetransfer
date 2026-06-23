// Round 2: does a short carrier sentence anchor the cognate's language?
// Tests the same words inside English/Spanish sentences, on turbo v2.5 (with
// language_code) and on v3 (context only). Real words, no respelling.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.resolve(__dirname, '../../..', '.env')});
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error('no key'); process.exit(1); }

const VOICE_ID = 'Czw3Dn181ypdrCOnPfif'; // Brian
const OUT = path.join(__dirname, '..', 'out', 'tts-test2');
fs.mkdirSync(OUT, {recursive: true});

const clips = [
  // turbo v2.5 + language_code, cognate inside an English carrier
  {key: '01-turbo-en-metal', text: 'Try this one. Metal.', model: 'eleven_turbo_v2_5', lang: 'en'},
  {key: '02-turbo-en-legal', text: 'What about legal?', model: 'eleven_turbo_v2_5', lang: 'en'},
  {key: '03-turbo-en-natural', text: 'Now you. Natural.', model: 'eleven_turbo_v2_5', lang: 'en'},
  // v3, same carrier, context only (keeps the warm voice)
  {key: '04-v3-en-metal', text: 'Try this one. Metal.', model: 'eleven_v3'},
  {key: '05-v3-en-legal', text: 'What about legal?', model: 'eleven_v3'},
  // Spanish side in a sentence (turbo es)
  {key: '06-turbo-es-metal', text: 'En español, metal.', model: 'eleven_turbo_v2_5', lang: 'es'},
];

async function synth({key, text, model, lang}) {
  const body = {text, model_id: model, voice_settings: {stability: 0.5, similarity_boost: 0.8}};
  if (lang) body.language_code = lang;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`[${key}] ${res.status}: ${(await res.text()).slice(0, 200)}`);
  fs.writeFileSync(path.join(OUT, `${key}.mp3`), Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${key}  (${model}${lang ? '/' + lang : ''})  "${text}"`);
}

for (const c of clips) {
  try { await synth(c); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
}
