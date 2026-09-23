// Drives the reducer directly through the new `responding` branch.
// The reducer is pure, so this is the whole state machine without React.
import { createInitialEngineState, lessonEngineReducer } from '@/engine/lesson-engine';
import type { Lesson } from '@/types/lesson';

const lesson: Lesson = {
  id: 'test', title: 't', description: 'd',
  steps: [
    { id: 's0', type: 'prompt', text: 'How would you say "to generate"?', acceptedAnswers: ['generar'], expectsResponse: true },
    { id: 's1', type: 'reveal', text: 'Generar.' }
  ]
};

function run(answer: string) {
  let s = createInitialEngineState(lesson);
  s = lessonEngineReducer(s, { type: 'START' });
  s = lessonEngineReducer(s, { type: 'PROMPT_REACHED', totalSeconds: 6 });
  s = lessonEngineReducer(s, { type: 'RESPOND', payload: { response: answer, kind: 'submitted' } });
  return s;
}

let pass = 0, total = 0;
const check = (label: string, cond: boolean, detail = '') => {
  total += 1; if (cond) pass += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

// RIGHT — must advance immediately, exactly as the app behaves today.
let s = run('generar');
check('right answer advances to the reveal', s.currentStepIndex === 1 && s.mode === 'playing');
check('right answer never enters responding', s.responding === null);
check('response still recorded', s.responses.length === 1 && s.responses[0].kind === 'submitted');

// UNCLEAR — must also advance silently. No bogus correction on STT noise.
s = run('I have no idea what that is');
check('unclear answer advances silently', s.currentStepIndex === 1 && s.responding === null);

// The emphatic form both models corrected wrongly.
s = run('yo generar');
check('"yo generar" treated as right, not corrected', s.currentStepIndex === 1 && s.responding === null);

// WRONG — must hold position and enter responding.
s = run('generacionar');
check('wrong answer holds position', s.currentStepIndex === 0, `index=${s.currentStepIndex}`);
check('wrong answer enters responding', s.mode === 'responding');
check('marked pending for the fetch', s.responding?.pending === true);
check('carries the normalized transcript', s.responding?.heard === 'generacionar', String(s.responding?.heard));

// Correction arrives, gets spoken, then we advance.
let t = lessonEngineReducer(s, { type: 'CORRECTION_READY', payload: { correction: 'That came from the noun form. Go back to the pattern.' } });
check('correction stored, pending cleared', t.responding?.pending === false && !!t.responding?.correction);
check('still holding position while it speaks', t.currentStepIndex === 0 && t.mode === 'responding');
t = lessonEngineReducer(t, { type: 'RESPONSE_DONE' });
check('advances to the reveal after speaking', t.currentStepIndex === 1 && t.mode === 'playing');
check('responding state cleared', t.responding === null);

// No correction available (no key, network error, leak guard fired).
let u = lessonEngineReducer(s, { type: 'CORRECTION_READY', payload: { correction: null } });
u = lessonEngineReducer(u, { type: 'RESPONSE_DONE' });
check('null correction still reaches the reveal', u.currentStepIndex === 1 && u.mode === 'playing');

// Timeout and skip are untouched by this feature.
let v = createInitialEngineState(lesson);
v = lessonEngineReducer(v, { type: 'START' });
v = lessonEngineReducer(v, { type: 'PROMPT_REACHED', totalSeconds: 6 });
v = lessonEngineReducer(v, { type: 'TIMEOUT' });
check('timeout behaves exactly as before', v.currentStepIndex === 1 && v.responding === null);

console.log(`\n${pass}/${total}`);
if (pass !== total) process.exitCode = 1;
