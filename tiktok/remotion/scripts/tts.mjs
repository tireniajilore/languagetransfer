// ElevenLabs TTS synthesis for the cognate clip.
//   node scripts/tts.mjs --smoke      # just hook + one reveal (cheap test)
//   node scripts/tts.mjs              # all 11 clips
// Reads ELEVENLABS_API_KEY from the repo-root .env. Writes mp3s to public/audio/.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..'); // repo root holds .env
dotenv.config({path: path.join(ROOT, '.env')});

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY missing from .env');
  process.exit(1);
}

const VOICE_ID = 'Czw3Dn181ypdrCOnPfif'; // Brian
const MODEL_ID = process.env.TTS_MODEL || 'eleven_v3';
const OUT_DIR = path.join(__dirname, '..', 'public', 'audio');

const scriptJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'spanish-cognates-01.json'), 'utf8'),
);

// Build the clip list keyed to match scenes.
const allClips = [
  {key: 'hook', text: scriptJson.hook.say},
  {key: 'lead', text: scriptJson.lead_in.say},
];
scriptJson.cards.forEach((c, i) => {
  allClips.push({key: `card${i}_prompt`, text: c.prompt_say});
  allClips.push({key: `card${i}_reveal`, text: c.reveal_say});
});
allClips.push({key: 'outro', text: scriptJson.outro.say});

const smoke = process.argv.includes('--smoke');
const clips = smoke
  ? allClips.filter((c) => c.key === 'hook' || c.key === 'card0_reveal')
  : allClips;

fs.mkdirSync(OUT_DIR, {recursive: true});

async function synth({key, text}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {stability: 0.5, similarity_boost: 0.8},
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${key}] ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(OUT_DIR, `${key}.mp3`);
  fs.writeFileSync(dest, buf);
  console.log(`✓ ${key.padEnd(14)} ${(buf.length / 1024).toFixed(0)} KB  "${text.slice(0, 48)}"`);
}

console.log(`Voice ${VOICE_ID} · model ${MODEL_ID} · ${clips.length} clip(s)${smoke ? ' (smoke test)' : ''}\n`);
for (const c of clips) {
  try {
    await synth(c);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
}
