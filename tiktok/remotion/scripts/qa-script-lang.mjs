// Static language QA for lesson SCRIPTS — runs before any TTS spend.
//
//   node scripts/qa-script-lang.mjs lesson-05-ant-ent
//   node scripts/qa-script-lang.mjs --all
//   node scripts/qa-script-lang.mjs --all --json > lang-issues.json
//
// The problem this catches: a segment carries ONE `lang` tag, but the teaching
// pattern often requires switching mid-line.
//
//   {"lang":"en", "say":"Important becomes importante. Different becomes diferente."}
//
// ElevenLabs receives language_code=en for that whole string, so `importante`
// and `diferente` come out with English phonics. Nothing in the data says
// otherwise, so nothing catches it except a human ear on every clip.
//
// This reads the script text and asks which spans must be pronounced in the
// OTHER language, then reports the segments whose single tag cannot be right.
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
const MODEL = 'gpt-4.1-mini';

const SYSTEM = `You audit scripts for a bilingual English/Spanish teaching video.

Each line has ONE language tag, but the teaching often switches language mid-line.
Typical patterns that switch:
  "Important becomes importante."        -> "importante" must be SPANISH
  "Preparation becomes preparación."     -> "preparación" must be SPANISH
  "Quick reminder: quiero means I want." -> "quiero" must be SPANISH
  "Take the English word natural."       -> "natural" must be ENGLISH (it is named AS English)
  "Es normal means it is normal."        -> "Es normal" must be SPANISH

Be careful with cognates spelled identically in both languages (natural, metal,
legal, ideal, hospital, normal). Decide from the TEACHING INTENT of the sentence,
not the spelling. A word presented as "the English word X" is English. A word
presented as the Spanish result of a rule is Spanish.

Given a line and its tag, list every span that must be pronounced in a DIFFERENT
language from the tag. Return STRICT JSON only:
{"spans":[{"text":"<exact substring>","should_be":"en|es","why":"<6 words>"}]}
If the whole line is correctly covered by its tag, return {"spans":[]}.`;

async function audit(say, lang) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: {type: 'json_object'},
      messages: [
        {role: 'system', content: SYSTEM},
        {role: 'user', content: `TAG: ${lang}\nLINE: ${say}`}
      ]
    })
  });
  if (!res.ok) return {spans: [], error: `HTTP ${res.status}`};
  const json = await res.json();
  try {
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
    // Only trust spans that actually occur in the line.
    const spans = (parsed.spans ?? []).filter(s => s?.text && say.includes(s.text));
    return {spans};
  } catch {
    return {spans: [], error: 'unparseable'};
  }
}

async function auditLesson(name) {
  const file = path.join(SCRIPTS, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.log(`  skip ${name}: no script`);
    return [];
  }
  const segments = JSON.parse(fs.readFileSync(file, 'utf8')).segments ?? [];
  const issues = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg.say?.trim() || !seg.lang) continue;
    const {spans} = await audit(seg.say, seg.lang);
    if (spans.length) {
      issues.push({lesson: name, index: i, lang: seg.lang, say: seg.say, spans});
    }
  }
  console.log(`  ${name}: ${segments.length} segments, ${issues.length} with a mid-line switch`);
  return issues;
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const targets = args.includes('--all')
  ? fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort()
  : args.filter(a => !a.startsWith('--'));

if (!targets.length) {
  console.error('usage: node scripts/qa-script-lang.mjs <lesson> | --all [--json]');
  process.exit(1);
}

if (!asJson) console.log(`Script language audit · ${MODEL} · ${targets.length} script(s)\n`);
const all = [];
for (const t of targets) all.push(...await auditLesson(t));

if (asJson) {
  console.log(JSON.stringify(all, null, 2));
} else {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${all.length} segments carry a language switch their single tag cannot express\n`);
  for (const issue of all) {
    console.log(`${issue.lesson} seg-${String(issue.index).padStart(2, '0')} [tag: ${issue.lang}]`);
    console.log(`  "${issue.say}"`);
    for (const s of issue.spans) {
      console.log(`    -> "${s.text}" should be ${s.should_be.toUpperCase()}  (${s.why})`);
    }
    console.log();
  }
  if (all.length) process.exitCode = 1;
}
