// Automated language QA for rendered lesson audio.
//
//   node scripts/qa-lang.mjs lesson-02-vowels      # one lesson
//   node scripts/qa-lang.mjs --all                 # every lesson with audio
//   node scripts/qa-lang.mjs --all --votes 5       # more votes, slower, steadier
//
// Listens to each rendered clip and decides whether it is PRONOUNCED in English
// or Spanish, then compares that to the `lang` tag in the script JSON. Flags
// disagreements for human review.
//
// Why blind: the judge is deliberately NOT shown the script text. Measured on
// real audio, giving it the text made it follow the text instead of the sound
// (an English clip labelled with Spanish-looking text was judged `es` 2/2).
// Blind + 3-vote majority scored 15/15 on lesson-02-vowels and 8/8 on
// same-text/different-pronunciation pairs, which the text cannot help with.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
dotenv.config({path: path.join(ROOT, '.env')});
dotenv.config({path: path.join(ROOT, 'lt-runner', '.env.local')});

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error('OPENAI_API_KEY missing from .env or lt-runner/.env.local');
  process.exit(1);
}

const SCRIPTS = path.join(ROOT, 'tiktok', 'scripts');
const AUDIO = path.join(__dirname, '..', 'public', 'audio');
const MODEL = 'gpt-audio';

const SYSTEM = `You are an audio QA judge for a bilingual English/Spanish teaching video.
Listen to the clip. Decide which language the words are PRONOUNCED in.
Many words are spelled the same in both (natural, metal, legal, ideal, hospital) so judge SOUND ONLY.
ENGLISH: reduced/schwa vowels, stress early. NAT-ch-rul, MET-ul, LEE-gul, eye-DEE-ul
SPANISH: pure vowels, syllable-timed, stress on the final syllable. na-tu-RAL, me-TAL, le-GAL, ee-de-AL
If the clip contains both languages, answer for the language of the LAST content word.
Answer with exactly one token: en OR es`;

async function judgeOnce(file) {
  const b64 = fs.readFileSync(file).toString('base64');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: MODEL,
      modalities: ['text'],
      temperature: 0.3,
      max_completion_tokens: 6,
      messages: [
        {role: 'system', content: SYSTEM},
        {role: 'user', content: [
          {type: 'input_audio', input_audio: {data: b64, format: 'mp3'}},
          {type: 'text', text: 'en or es?'}
        ]}
      ]
    })
  });
  if (!res.ok) return null;
  const json = await res.json();
  const a = (json.choices?.[0]?.message?.content ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return a === 'en' || a === 'es' ? a : null;
}

// Majority vote. Retries a couple of extra times to absorb the occasional
// non-answer (the model sometimes replies "please provide the audio clip").
async function judge(file, votes) {
  const got = [];
  for (let i = 0; i < votes + 2 && got.length < votes; i += 1) {
    const a = await judgeOnce(file);
    if (a) got.push(a);
  }
  if (!got.length) return {verdict: '??', confidence: 0, votes: got};
  const en = got.filter(v => v === 'en').length;
  const es = got.length - en;
  return {
    verdict: en >= es ? 'en' : 'es',
    confidence: Math.max(en, es) / got.length,
    votes: got
  };
}

function lessonsWithAudio() {
  if (!fs.existsSync(AUDIO)) return [];
  return fs.readdirSync(AUDIO)
    .filter(d => fs.existsSync(path.join(SCRIPTS, `${d}.json`)))
    .filter(d => fs.readdirSync(path.join(AUDIO, d)).some(f => /^seg-\d+\.mp3$/.test(f)))
    .sort();
}

async function qaLesson(name, votes) {
  const scriptPath = path.join(SCRIPTS, `${name}.json`);
  if (!fs.existsSync(scriptPath)) {
    console.log(`  skip ${name}: no script at ${path.relative(ROOT, scriptPath)}`);
    return {checked: 0, flagged: []};
  }
  const segments = JSON.parse(fs.readFileSync(scriptPath, 'utf8')).segments ?? [];
  const dir = path.join(AUDIO, name);
  const flagged = [];
  let checked = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg.lang || !seg.say?.trim()) continue;
    const file = path.join(dir, `seg-${String(i).padStart(2, '0')}.mp3`);
    if (!fs.existsSync(file)) continue;

    const {verdict, confidence, votes: cast} = await judge(file, votes);
    checked += 1;
    if (verdict !== seg.lang) {
      flagged.push({index: i, expected: seg.lang, heard: verdict, confidence, say: seg.say});
      console.log(`  FLAG seg-${String(i).padStart(2, '0')}  tagged ${seg.lang}, sounds ${verdict} (conf ${confidence.toFixed(2)}) [${cast}]`);
      console.log(`       "${seg.say}"`);
    }
  }
  console.log(`  ${name}: ${checked} clips checked, ${flagged.length} flagged`);
  return {checked, flagged};
}

const args = process.argv.slice(2);
const votes = Number(args[args.indexOf('--votes') + 1]) || 3;
const targets = args.includes('--all')
  ? lessonsWithAudio()
  : args.filter(a => !a.startsWith('--') && Number.isNaN(Number(a)));

if (!targets.length) {
  console.error('usage: node scripts/qa-lang.mjs <lesson-name> | --all [--votes N]');
  process.exit(1);
}

console.log(`Language QA · ${MODEL} · ${votes}-vote majority · blind (no script text)\n`);
let totalChecked = 0;
const allFlagged = [];
for (const name of targets) {
  const {checked, flagged} = await qaLesson(name, votes);
  totalChecked += checked;
  flagged.forEach(f => allFlagged.push({lesson: name, ...f}));
}

console.log(`\n${'='.repeat(64)}`);
console.log(`${totalChecked} clips checked across ${targets.length} lesson(s) · ${allFlagged.length} flagged`);
if (allFlagged.length) {
  console.log('\nNeeds a human ear:');
  for (const f of allFlagged) {
    console.log(`  ${f.lesson} seg-${String(f.index).padStart(2, '0')}  tagged ${f.expected}, sounds ${f.heard} (conf ${f.confidence.toFixed(2)})`);
    console.log(`    "${f.say}"`);
  }
  process.exitCode = 1;
}
