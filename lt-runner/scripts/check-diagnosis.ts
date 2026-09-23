// Labelled set for the diagnosis classifier. Run against a live dev server:
//   npm run dev  (in another shell)  then  npm run check:diagnosis
import { DIAGNOSES } from '@/lib/diagnoses';

const TAUGHT = [
  'Te quiero means I love you, literally I want you. Take away te and quiero means I want.',
  'No goes in front of the verb to make it negative.',
  'Words ending in -ion in English become -cion in Spanish.',
  'Take off the -cion and add -ar to get the verb.',
  'Quiero plus a verb: I want to do something.',
  'Words ending in -ant or -ent in English take an e on the end in Spanish.'
];

type Case = { prompt: string; answer: string; heard: string; want: string; mode?: 'spoken' | 'typed' };

const CASES: Case[] = [
  { prompt: 'How would you say "I want to cancel"?', answer: 'Quiero cancelar', heard: 'quiero cancelacion', want: 'noun-for-verb' },
  { prompt: 'How would you say "I want to prepare"?', answer: 'Quiero preparar', heard: 'quiero preparacion', want: 'noun-for-verb' },
  { prompt: 'How would you say "I want to cancel"?', answer: 'Quiero cancelar', heard: 'quiero cancelo', want: 'conjugated-second-verb' },
  { prompt: 'How would you say "I want to explore"?', answer: 'Quiero explorar', heard: 'quiero exploro', want: 'conjugated-second-verb' },
  { prompt: 'How would you say "I want to cancel"?', answer: 'Quiero cancelar', heard: 'no quiero cancelar', want: 'added-negation' },
  { prompt: 'How would you say "I do not want to cancel"?', answer: 'No quiero cancelar', heard: 'quiero cancelar', want: 'missing-negation' },
  { prompt: 'How would you say "I want to cancel"?', answer: 'Quiero cancelar', heard: 'quiero cancel', want: 'reached-for-english' },
  { prompt: 'How would you say "important"?', answer: 'Importante', heard: 'important', want: 'reached-for-english' },
  { prompt: 'How would you say "different"?', answer: 'Diferente', heard: 'diferante', want: 'wrong-ending' },
  { prompt: 'How would you say "constant"?', answer: 'Constante', heard: 'constento', want: 'wrong-ending' },
  { prompt: 'How would you say "the generation"?', answer: 'Generacion', heard: 'generacionacion', want: 'over-applied-rule' },
  { prompt: 'How would you say "I want to cancel it"?', answer: 'Quiero cancelarlo', heard: 'quiero lo cancelar', want: 'english-word-order' },
  { prompt: 'How would you say "I want to cancel"?', answer: 'Quiero cancelar', heard: 'cancelar', want: 'missing-piece' },
  { prompt: 'How would you say "important"?', answer: 'Importante', heard: 'es muy importante', want: 'extra-piece' },
  // Spoken-only: a pronunciation diagnosis must never be chosen for typed input.
  { prompt: 'How would you say "natural"?', answer: 'Natural', heard: 'natural', want: 'english-sounds', mode: 'spoken' },
  { prompt: 'How would you say "natural"?', answer: 'Natural', heard: 'natural', want: 'none', mode: 'typed' },
  // Nothing in the catalogue fits: staying silent is the right answer.
  { prompt: 'How would you say "I want to cancel"?', answer: 'Quiero cancelar', heard: 'the dog is on the table', want: 'none' },
  { prompt: 'How would you say "important"?', answer: 'Importante', heard: 'zzz qqq', want: 'none' },
];

const ids = new Set(DIAGNOSES.map(d => d.id));
for (const c of CASES) if (c.want !== 'none' && !ids.has(c.want)) throw new Error(`unknown expected id: ${c.want}`);

async function main() {
  const base = process.env.BASE ?? 'http://localhost:3000';
  let pass = 0;
  const confusion: Record<string, string[]> = {};

  for (const c of CASES) {
    const res = await fetch(`${base}/api/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText: c.prompt, acceptedAnswers: [c.answer], heard: c.heard,
        taughtSoFar: TAUGHT, mode: c.mode ?? 'typed'
      })
    });
    const data = await res.json() as { diagnosis?: string | null };
    const got = data.diagnosis ?? 'none';
    const ok = got === c.want;
    if (ok) pass += 1;
    else (confusion[c.want] ??= []).push(got);
    console.log(`${ok ? 'ok  ' : 'MISS'}  want ${c.want.padEnd(24)} got ${String(got).padEnd(24)} "${c.heard}"`);
  }

  console.log(`\n${pass}/${CASES.length}`);
  if (Object.keys(confusion).length) {
    console.log('\nconfused:');
    for (const [want, got] of Object.entries(confusion)) console.log(`  ${want} -> ${got.join(', ')}`);
  }
}

main();
