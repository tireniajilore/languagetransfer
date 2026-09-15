// Catch the clips where a mixed English/Spanish line FAILED to switch.
//
//   node scripts/qa-switch.mjs lesson-05-ant-ent
//   node scripts/qa-switch.mjs --all
//   node scripts/qa-switch.mjs --all --votes 5
//
// ElevenLabs usually handles a mid-sentence switch correctly even though the
// segment carries a single language_code. Usually. This finds the minority of
// renders where it did not, without listening to every clip by hand.
//
// Why not qa-lang.mjs: that judges a WHOLE clip as one language. For
// "Important becomes importante." the whole-clip answer is `en`, which is
// correct and tells you nothing about the one word that matters. This asks
// about each switched word specifically.
//
// Two passes:
//   1. text  — find the spans inside a line that must be the OTHER language
//   2. audio — for each span, ask whether THAT WORD was pronounced correctly
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
const AUDIO_MODEL = 'gpt-audio';

// ---------- pass 1: which spans switch language? ----------
//
// Deterministic, not model-guessed. The Spanish vocabulary of a lesson is
// already in the lesson: every `es`-tagged segment names it. Build that lexicon,
// then look for those exact words appearing inside `en`-tagged lines. Zero
// false positives from English words like "Spanish" or "to create", which an
// LLM span-finder flags constantly.

const CARRIERS = /^(en\s+espa(?:ñ|n)ol\s*[,:]?\s*|say\s+it\s+in\s+spanish\s*[,:]?\s*)/i;
const STOP = new Set(['en', 'el', 'la', 'es', 'un', 'una', 'de', 'y', 'a', 'o']);

function spanishLexicon(segments) {
  const lex = new Set();
  for (const seg of segments) {
    if (seg.lang !== 'es') continue;
    const src = (seg.word ?? seg.say ?? '').replace(CARRIERS, '');
    for (const w of src.toLowerCase().match(/[a-zá-úñü]+/gi) ?? []) {
      if (w.length > 3 && !STOP.has(w)) lex.add(w);
    }
  }
  return lex;
}

// Spans = Spanish lexicon words occurring inside an `en`-tagged line.
function findSpans(say, lang, lex) {
  if (lang !== 'en') return [];
  const seen = new Set();
  const spans = [];
  for (const raw of say.match(/[a-zá-úñü]+/gi) ?? []) {
    const w = raw.toLowerCase();
    if (!lex.has(w) || seen.has(w)) continue;
    seen.add(w);
    spans.push({text: raw, should_be: 'es'});
  }
  return spans;
}

// ---------- pass 2: was THAT WORD pronounced in the right language? ----------

const JUDGE_SPAN = `You are an audio QA judge for a bilingual English/Spanish teaching video.
You will hear one clip containing BOTH languages, and be asked about ONE word in it.

Listen for that word specifically. Decide how it was PRONOUNCED. Ignore the rest of the clip.

SPANISH pronunciation: pure vowels, syllable-timed, stress on the final syllable.
  importante = im-por-TAN-te     preparación = pre-pa-ra-SYON
  constante  = kons-TAN-te       obligar     = o-bli-GAR
ENGLISH pronunciation: reduced/schwa vowels, earlier stress, English consonants.
  importante read as English = im-POR-tuhnt-ay
  constante  read as English = KON-stunt-ay

If the word was pronounced with Spanish sounds answer: es
If it was read with English sounds answer: en
If you genuinely cannot hear that word clearly, answer: unclear
Answer with exactly one token.`;

async function judgeSpanOnce(file, word, line) {
  const b64 = fs.readFileSync(file).toString('base64');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: AUDIO_MODEL, modalities: ['text'], temperature: 0.3, max_completion_tokens: 6,
      messages: [
        {role: 'system', content: JUDGE_SPAN},
        {role: 'user', content: [
          {type: 'input_audio', input_audio: {data: b64, format: 'mp3'}},
          {type: 'text', text: `The clip says: "${line}"\nHow was the word "${word}" pronounced? en, es, or unclear?`}
        ]}
      ]
    })
  });
  if (!res.ok) return null;
  const a = ((await res.json()).choices?.[0]?.message?.content ?? '')
    .trim().toLowerCase().replace(/[^a-z]/g, '');
  return ['en', 'es', 'unclear'].includes(a) ? a : null;
}

async function judgeSpan(file, word, line, votes) {
  const got = [];
  for (let i = 0; i < votes + 2 && got.length < votes; i += 1) {
    const a = await judgeSpanOnce(file, word, line);
    if (a) got.push(a);
  }
  if (!got.length) return {verdict: '??', confidence: 0, votes: got};
  const tally = got.reduce((m, v) => ({...m, [v]: (m[v] ?? 0) + 1}), {});
  const verdict = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  return {verdict, confidence: tally[verdict] / got.length, votes: got};
}

// ---------- driver ----------

async function checkLesson(name, votes) {
  const scriptPath = path.join(SCRIPTS, `${name}.json`);
  if (!fs.existsSync(scriptPath)) return [];
  const segments = JSON.parse(fs.readFileSync(scriptPath, 'utf8')).segments ?? [];
  const lex = spanishLexicon(segments);
  const dir = path.join(AUDIO, name);
  if (!fs.existsSync(dir)) return [];

  const failures = [];
  let switchesChecked = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg.say?.trim() || !seg.lang) continue;
    const file = path.join(dir, `seg-${String(i).padStart(2, '0')}.mp3`);
    if (!fs.existsSync(file)) continue;

    const spans = findSpans(seg.say, seg.lang, lex);
    if (!spans.length) continue;

    for (const span of spans) {
      const {verdict, confidence, votes: cast} = await judgeSpan(file, span.text, seg.say, votes);
      switchesChecked += 1;
      const bad = verdict !== span.should_be && verdict !== '??';
      if (bad) {
        failures.push({lesson: name, index: i, word: span.text, expected: span.should_be, heard: verdict, confidence, say: seg.say});
        console.log(`  FAIL seg-${String(i).padStart(2, '0')}  "${span.text}" should be ${span.should_be.toUpperCase()}, heard ${verdict.toUpperCase()} (conf ${confidence.toFixed(2)}) [${cast}]`);
      }
    }
  }
  console.log(`  ${name}: ${switchesChecked} switches checked, ${failures.length} failed`);
  return failures;
}

const args = process.argv.slice(2);
const votes = Number(args[args.indexOf('--votes') + 1]) || 3;
const targets = args.includes('--all')
  ? fs.readdirSync(AUDIO).filter(d => fs.existsSync(path.join(SCRIPTS, `${d}.json`))).sort()
  : args.filter(a => !a.startsWith('--') && Number.isNaN(Number(a)));

if (!targets.length) {
  console.error('usage: node scripts/qa-switch.mjs <lesson> | --all [--votes N]');
  process.exit(1);
}

console.log(`Mid-sentence switch QA · ${AUDIO_MODEL} · ${votes}-vote majority\n`);
const all = [];
for (const t of targets) all.push(...await checkLesson(t, votes));

console.log(`\n${'='.repeat(70)}`);
console.log(`${all.length} failed switches across ${targets.length} lesson(s)`);
if (all.length) {
  console.log('\nRe-render or listen to these:');
  for (const f of all) {
    console.log(`  ${f.lesson} seg-${String(f.index).padStart(2, '0')}  "${f.word}" came out ${f.heard.toUpperCase()} (conf ${f.confidence.toFixed(2)})`);
    console.log(`    "${f.say}"`);
  }
  process.exitCode = 1;
}
