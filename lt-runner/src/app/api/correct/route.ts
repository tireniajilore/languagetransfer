import { normalize } from '@/lib/answer-match';
import { DIAGNOSES, diagnosisMenu, findDiagnosis, isSelectable } from '@/lib/diagnoses';

export const runtime = 'nodejs';

// The model classifies. It never writes a word the learner hears, so this is a
// small closed-set decision rather than prose generation — the task models are
// reliable at, and the one that cannot produce an off-voice or invented line.
const MODEL = 'gpt-4.1-mini';

const CLASSIFY = `You are the diagnosis layer of a Spanish tutor built on the Language Transfer method.

A learner has just answered a prompt and got it wrong. Your ONLY job is to decide WHICH
KIND of mistake they made, from the fixed list below. You do not write a correction and
you do not talk to the learner.

START FROM none. Only move off it when one entry in the list CLEARLY and SPECIFICALLY
describes what they did. A diagnosis that merely could apply is not good enough — naming
the wrong cause teaches the learner something false and costs their trust, while saying
nothing costs only a missed opportunity. Silence is cheap. Being wrong is not.

Answer none when:
- what they said is unrelated to the target, or is noise, or is in another language
- they actually got it right
- you can see it is wrong but cannot say which entry describes why
- two entries fit equally well and you cannot separate them

Rules:
- Answer with exactly one id, or none. Nothing else. No punctuation, no explanation.
- Judge only what they actually said against what was wanted.
- Do not use an entry as a catch-all because nothing better fits. That is what none is for.

THE LIST:
`;

interface CorrectRequest {
  promptText?: string;
  acceptedAnswers?: string[];
  heard?: string;
  /** Text of the lesson steps up to this point — the only Spanish the learner has. */
  taughtSoFar?: string[];
  /** Spoken answers can be diagnosed on pronunciation. Typed ones cannot. */
  mode?: 'spoken' | 'typed';
}

const VALID = new Set([...DIAGNOSES.map(d => d.id), 'none']);

// Belt and braces. The catalogue is authored so it should never state an answer,
// but a future entry might, and the reveal is what delivers the answer.
function leaksAnswer(line: string, acceptedAnswers: string[]): boolean {
  const said = ` ${normalize(line)} `;
  return acceptedAnswers.some(answer => {
    const target = normalize(answer);
    return target.length > 2 && said.includes(` ${target} `);
  });
}

async function classify(apiKey: string, body: CorrectRequest, mode: 'spoken' | 'typed'): Promise<string | null> {
  const taught = (body.taughtSoFar ?? []).join(' ').slice(-2000);
  const user = [
    'WHAT THE LEARNER HAS BEEN TAUGHT SO FAR:',
    taught || '(start of the course)',
    '',
    `THE PROMPT: ${body.promptText ?? ''}`,
    `THE ANSWER WANTED: ${(body.acceptedAnswers ?? []).join(' / ')}`,
    `WHAT THEY SAID: ${body.heard ?? ''}`,
    '',
    'Which id?'
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_completion_tokens: 12,
      messages: [
        { role: 'system', content: CLASSIFY + diagnosisMenu(mode) },
        { role: 'user', content: user }
      ]
    }),
    cache: 'no-store'
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const id = (data.choices?.[0]?.message?.content ?? '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  return VALID.has(id) ? id : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  // No key is never something the learner should hear about. Stay silent and let the
  // lesson fall through to the reveal exactly as it does today.
  if (!apiKey) {
    return Response.json({ correction: null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let body: CorrectRequest;
  try {
    body = (await request.json()) as CorrectRequest;
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const mode = body.mode === 'spoken' ? 'spoken' : 'typed';
  const id = await classify(apiKey, body, mode);
  if (!id || id === 'none' || !isSelectable(id, mode)) {
    return Response.json({ correction: null, diagnosis: id ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const diagnosis = findDiagnosis(id);
  if (!diagnosis || leaksAnswer(diagnosis.say, body.acceptedAnswers ?? [])) {
    return Response.json({ correction: null, diagnosis: id }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return Response.json(
    { correction: diagnosis.say, diagnosis: id },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
