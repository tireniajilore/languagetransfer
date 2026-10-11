/** Commands for the GPT-Live sideband. All appends use the documented
 * content/delegation_id wire contract, never an invented 'instructions' key.
 * A speakable lesson passage is commentary; behavioral constraints are instructions.
 */
import { randomUUID } from 'node:crypto';
import type { LessonCue } from './conductor';
import { cueInstructions } from './sessionManager';

export interface LiveCommandSender {
  sendCommand(command: Record<string, unknown>): void;
}

/** Small enough to stay comfortably below the 500-token Live append limit. */
function chunks(lines: string[]): string[] {
  const result: string[] = [];
  let current = '';
  for (const line of lines) {
    // Split an unusually long authored passage without dropping any words.
    const words = line.split(/\s+/).filter(Boolean);
    let part = '';
    for (const word of words) {
      if (part && (part + ' ' + word).length > 760) {
        if (current) { result.push(current); current = ''; }
        result.push(part);
        part = '';
      }
      part += (part ? ' ' : '') + word;
    }
    if (!part) continue;
    if (current && (current + '\n' + part).length > 760) {
      result.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + part;
  }
  if (current) result.push(current);
  return result;
}
function append(sender: LiveCommandSender, type: 'session.instructions.append' | 'session.commentary.append', content: string): void {
  sender.sendCommand({ type, event_id: 'lt_' + randomUUID(), delegation_id: null, content });
}

/** Application-owned sequence: precise instruction followed by the actual
 * original lesson paragraphs and the last prescribed question. */
export function deliverLessonCue(sender: LiveCommandSender, cue: LessonCue): number {
  append(sender, 'session.instructions.append', cueInstructions(cue));
  if (cue.complete) {
    append(sender, 'session.commentary.append', "We've finished this lesson. Well done!");
    return 1;
  }
  const text = [...cue.teacherLines];
  if (cue.question) text.push(cue.question);
  const passages = chunks(text);
  for (const passage of passages) append(sender, 'session.commentary.append', passage);
  return passages.length;
}

/** No answer leak: reminders may repeat the original question but never
 * pull in unseen examples or model-generated substitutions. */
export function deliverRetry(sender: LiveCommandSender, question: string, attempts: number): void {
  append(sender, 'session.instructions.append',
    'Stay on the current authored question. Be warm and concise. Do not introduce a different example or give the answer. ' +
    'If the learner only acknowledged you, gently repeat the question. Otherwise offer a short targeted hint grounded in the original lesson.');
  append(sender, 'session.commentary.append',
    (attempts > 1 ? "Let's work through the same question carefully. " : "Let's stay with this one. ") + question);
}
