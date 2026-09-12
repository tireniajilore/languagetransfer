import { matchAnswer } from '@/lib/answer-match';

const cases: Array<[string, string[], string, string]> = [
  // [spoken, accepted, expected, why]
  ['Quiero cancelar.',        ['Quiero cancelar'], 'right',   'exact'],
  ['quiero cancelar',         ['Quiero cancelar'], 'right',   'case + punctuation'],
  ['Yo quiero cancelar.',     ['Quiero cancelar'], 'right',   'emphatic yo — the case that must NOT be corrected'],
  ['um, quiero cancelar',     ['Quiero cancelar'], 'right',   'hesitation'],
  ['Canción',                 ['Cancion'],         'right',   'accents stripped'],
  ['No quiero cancelar.',     ['Quiero cancelar'], 'wrong',   'negation flips meaning — must NOT be right'],
  ['Quiero cancelación.',     ['Quiero cancelar'], 'wrong',   'noun instead of verb'],
  ['Quiero cancelo.',         ['Quiero cancelar'], 'wrong',   'conjugated 2nd verb'],
  ['Quiero cancelarlo.',      ['Quiero cancelar'], 'wrong',   'added object pronoun'],
  ['I have no idea',          ['Quiero cancelar'], 'unclear', 'not an attempt'],
  ['',                        ['Quiero cancelar'], 'unclear', 'empty'],
  ['Quiero cancelar',         [],                  'unclear', 'no accepted answers'],
  ['Es importante',           ['Es importante', 'Importante'], 'right', 'multiple accepted'],
  ['Importante',              ['Es importante', 'Importante'], 'right', 'matches the 2nd'],
];

let pass = 0;
for (const [spoken, accepted, expected, why] of cases) {
  const r = matchAnswer(spoken, accepted);
  const ok = r.outcome === expected;
  if (ok) pass += 1;
  const d = r.distance === undefined ? '    ' : r.distance.toFixed(2);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${expected.padEnd(7)} got ${r.outcome.padEnd(7)} d=${d}  "${spoken}"  — ${why}`);
}
console.log(`\n${pass}/${cases.length}`);
