import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { availableLessonNumbers } from '../conductor';
import { getTeachingSpec } from '../teachingSpec';
import sourceSpec from '../specs/lesson-02.json';
import {
  freshCheckpoint,
  authorizeStep,
  markSent,
  observeSpeech,
  confirmDelivery,
  applyDecision,
  validateCheckpoint,
} from '../supervisedConductor';
import { deterministicDecision } from '../supervisor';

const spec = getTeachingSpec(2);
function question() {
  let s = freshCheckpoint(spec);
  while (spec.steps[s.stepIndex].kind !== 'question') {
    s = observeSpeech(markSent(authorizeStep(spec, s, 'directive')), 'speech');
    s = confirmDelivery(
      spec,
      s,
      'speech',
      true,
      true,
      'complete teaching text',
    );
  }
  s = observeSpeech(
    markSent(authorizeStep(spec, s, 'question')),
    'question-spoken',
  );
  return confirmDelivery(
    spec,
    s,
    'question-spoken',
    true,
    true,
    'question text',
  );
}
describe('source-linked teaching specification', () => {
  it('every step cites an exact span of the unchanged original transcript', () => {
    const transcript = readFileSync(
      join(__dirname, '../../../../', sourceSpec.sourceFile),
      'utf8',
    );
    expect(createHash('sha256').update(transcript).digest('hex')).toBe(
      sourceSpec.sourceSha256,
    );
    for (const step of spec.steps)
      for (const [i, ref] of step.sourceTurnIds.entries()) {
        const [, start, end] = ref.split(':').map(Number);
        expect(transcript.slice(start, end)).toBe(step.sourceTranscript[i]);
      }
  });
  it('restores stress discovery and omitted examples without a synthetic outro', () => {
    expect(spec.steps[2].text).toContain('What do you notice');
    for (const word of [
      'fatal',
      'natal',
      'colonial',
      'festival',
      'personal',
      'total',
    ])
      expect(
        spec.steps.some((s) => s.kind === 'question' && s.text.includes(word)),
      ).toBe(true);
    expect(spec.steps.at(-1)?.text).toContain('With structure');
    expect(spec.steps.some((s) => s.text.includes('emotional'))).toBe(false);
    expect(availableLessonNumbers()).not.toContain(25);
  });
});
describe('authoritative supervised conductor', () => {
  it('does not satisfy explanations on authorization or observations without playback', () => {
    let s = markSent(authorizeStep(spec, freshCheckpoint(spec), 'd'));
    expect(s.stepIndex).toBe(0);
    s = observeSpeech(s, 'output');
    expect(confirmDelivery(spec, s, 'output', true, false)).toBe(s);
    expect(confirmDelivery(spec, s, 'output', false, true)).toBe(s);
    expect(confirmDelivery(spec, s, 'stale-output', true, true)).toBe(s);
    expect(confirmDelivery(spec, s, 'output', true, true).stepIndex).toBe(1);
  });
  it('rejects stale, fabricated and acknowledgment-based understanding evidence', () => {
    const s = question();
    const base = deterministicDecision(spec, s, 'okay')!;
    for (const changed of [
      { ...base, proposedAction: 'advance', understanding: 'demonstrated' },
      {
        ...base,
        learnerIntent: 'answer',
        proposedAction: 'advance',
        understanding: 'demonstrated',
        stateVersion: s.stateVersion - 1,
      },
      {
        ...base,
        learnerIntent: 'answer',
        proposedAction: 'advance',
        understanding: 'demonstrated',
        evidence: ['fabricated'],
      },
      {
        ...base,
        learnerIntent: 'answer',
        proposedAction: 'advance',
        understanding: 'demonstrated',
        confidence: 0.8,
      },
    ])
      expect(applyDecision(spec, s, 'user', 'okay', changed).stepIndex).toBe(
        s.stepIndex,
      );
  });
  it('cannot complete a checkpoint with missing receipts or an unverified final step', () => {
    const s = freshCheckpoint(spec);
    expect(() =>
      validateCheckpoint(spec, {
        ...s,
        phase: 'completed',
        stepIndex: spec.steps.length,
      }),
    ).toThrow();
    expect(() => validateCheckpoint(spec, { ...s, stepIndex: 1 })).toThrow();
    expect(() =>
      validateCheckpoint(spec, { ...s, lessonVersion: 'stale-version' }),
    ).toThrow();
  });
});
