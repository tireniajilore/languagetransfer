/** Pure state transitions. No transport event or model can move the syllabus on its own. */
import { z } from 'zod';
import { normalizeAnswer } from './conductor';
import type { TeachingSpecification } from './teachingSpec';

export const DecisionSchema = z
  .object({
    lessonVersion: z.string(),
    stepId: z.string(),
    stateVersion: z.number().int().nonnegative(),
    learnerIntent: z.enum([
      'answer',
      'clarification',
      'acknowledgment',
      'thinking',
      'interruption',
      'pause_request',
      'off_topic',
    ]),
    understanding: z.enum([
      'demonstrated',
      'partial',
      'incorrect',
      'unclear',
      'not_assessed',
    ]),
    proposedAction: z.enum([
      'advance',
      'give_hint',
      'rephrase',
      'probe',
      'repeat',
      'wait',
      'pause',
    ]),
    evidence: z.array(z.string()).max(8),
    proposedHintLevel: z.number().int().nonnegative().nullable(),
    reasoningSummary: z.string().max(500),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type TeachingDecision = z.infer<typeof DecisionSchema>;
const ReceiptSchema = z.object({
  stepId: z.string(),
  deliveryEventId: z.string(),
  answerEventId: z.string().nullable(),
  deliveryText: z.string(),
  directiveId: z.string(),
  appendAcknowledged: z.boolean(),
});
export const CheckpointSchema = z.object({
  lessonNumber: z.number().int(),
  lessonVersion: z.string(),
  stateVersion: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  phase: z.enum([
    'ready',
    'authorized',
    'sent',
    'acknowledged',
    'delivering',
    'awaiting_answer',
    'paused',
    'completed',
  ]),
  attempts: z.number().int().nonnegative(),
  hintLevel: z.number().int(),
  directive: z
    .object({
      id: z.string(),
      acknowledged: z.boolean(),
      outputEventId: z.string().nullable(),
      delivered: z.boolean(),
      deliveryText: z.string(),
    })
    .nullable(),
  receipts: z.array(ReceiptSchema),
  evidence: z.array(
    z.object({
      stepId: z.string(),
      eventId: z.string(),
      text: z.string(),
      decision: DecisionSchema,
    }),
  ),
});
export type TeachingCheckpoint = z.infer<typeof CheckpointSchema>;
export function freshCheckpoint(
  spec: TeachingSpecification,
): TeachingCheckpoint {
  return {
    lessonNumber: spec.number,
    lessonVersion: spec.version,
    stateVersion: 0,
    stepIndex: 0,
    phase: 'ready',
    attempts: 0,
    hintLevel: -1,
    directive: null,
    receipts: [],
    evidence: [],
  };
}
export function validateCheckpoint(
  spec: TeachingSpecification,
  raw: unknown,
): TeachingCheckpoint {
  const s = CheckpointSchema.parse(raw);
  if (
    s.lessonVersion !== spec.version ||
    s.lessonNumber !== spec.number ||
    s.stepIndex > spec.steps.length ||
    s.receipts.length !== s.stepIndex ||
    s.receipts.some((r, i) => r.stepId !== spec.steps[i].id) ||
    s.receipts.some(
      (r, i) =>
        !r.deliveryText ||
        (spec.steps[i].kind === 'question' &&
          (!r.answerEventId ||
            !s.evidence.some(
              (e) =>
                e.eventId === r.answerEventId &&
                e.stepId === r.stepId &&
                e.decision.understanding === 'demonstrated',
            ))),
    ) ||
    (s.phase === 'completed') !== (s.stepIndex === spec.steps.length)
  )
    throw new Error('invalid lesson checkpoint');
  return s;
}
export function authorizeStep(
  spec: TeachingSpecification,
  s: TeachingCheckpoint,
  id: string,
): TeachingCheckpoint {
  validateCheckpoint(spec, s);
  if (s.phase === 'completed' || s.phase === 'paused') return s;
  return {
    ...s,
    stateVersion: s.stateVersion + 1,
    phase: 'authorized',
    directive: {
      id,
      acknowledged: false,
      outputEventId: null,
      delivered: false,
      deliveryText: '',
    },
  };
}
export function markSent(s: TeachingCheckpoint): TeachingCheckpoint {
  if (s.phase !== 'authorized' || !s.directive)
    throw new Error('no authorized directive');
  return { ...s, phase: 'sent' };
}
export function acknowledge(
  s: TeachingCheckpoint,
  id: string,
): TeachingCheckpoint {
  if (!s.directive || s.directive.id !== id || s.phase === 'paused') return s;
  return {
    ...s,
    phase: s.phase === 'sent' ? 'acknowledged' : s.phase,
    directive: { ...s.directive, acknowledged: true },
  };
}
export function observeSpeech(
  s: TeachingCheckpoint,
  id: string,
): TeachingCheckpoint {
  if (!s.directive || !['sent', 'acknowledged', 'delivering'].includes(s.phase))
    return s;
  return {
    ...s,
    phase: 'delivering',
    directive: { ...s.directive, outputEventId: id },
  };
}
function satisfy(
  spec: TeachingSpecification,
  s: TeachingCheckpoint,
  answerEventId: string | null,
): TeachingCheckpoint {
  if (!s.directive?.delivered || !s.directive.outputEventId)
    throw new Error('delivery not verified');
  const receipts = [
    ...s.receipts,
    {
      stepId: spec.steps[s.stepIndex].id,
      deliveryEventId: s.directive.outputEventId,
      answerEventId,
      deliveryText: s.directive.deliveryText,
      directiveId: s.directive.id,
      appendAcknowledged: s.directive.acknowledged,
    },
  ];
  const stepIndex = s.stepIndex + 1;
  return {
    ...s,
    receipts,
    stepIndex,
    stateVersion: s.stateVersion + 1,
    phase: stepIndex === spec.steps.length ? 'completed' : 'ready',
    attempts: 0,
    hintLevel: -1,
    directive: null,
  };
}
/** Coverage and browser playback-boundary evidence are BOTH required, never an append ACK. */
export function confirmDelivery(
  spec: TeachingSpecification,
  s: TeachingCheckpoint,
  eventId: string,
  covered: boolean,
  playbackObserved: boolean,
  deliveryText = '',
): TeachingCheckpoint {
  if (
    !covered ||
    !playbackObserved ||
    s.phase !== 'delivering' ||
    s.directive?.outputEventId !== eventId
  )
    return s;
  const delivered = {
    ...s,
    directive: { ...s.directive, delivered: true, deliveryText },
  };
  return spec.steps[s.stepIndex].kind === 'question'
    ? { ...delivered, phase: 'awaiting_answer' }
    : satisfy(spec, delivered, null);
}
export function applyDecision(
  spec: TeachingSpecification,
  s: TeachingCheckpoint,
  eventId: string,
  text: string,
  raw: unknown,
): TeachingCheckpoint {
  const d = DecisionSchema.parse(raw);
  const step = spec.steps[s.stepIndex];
  if (
    !step ||
    d.lessonVersion !== spec.version ||
    d.stepId !== step.id ||
    d.stateVersion !== s.stateVersion ||
    s.evidence.some((e) => e.eventId === eventId) ||
    s.phase !== 'awaiting_answer'
  )
    return s;
  const observed = {
    ...s,
    evidence: [
      ...s.evidence,
      { stepId: step.id, eventId, text: text.slice(0, 1000), decision: d },
    ].filter(
      (e, i, a) =>
        (e.decision.proposedAction === 'advance' &&
          e.decision.understanding === 'demonstrated') ||
        i >= a.length - 100,
    ),
  };
  if (d.proposedAction === 'pause')
    return { ...observed, phase: 'paused', stateVersion: s.stateVersion + 1 };
  const acknowledgment =
    /^(ok|okay|yes|yeah|right|mm hmm|uh huh|got it|sure)( (ok|okay|yes|yeah|right|sure))*$/.test(
      normalizeAnswer(text),
    );
  if (
    !acknowledgment &&
    d.proposedAction === 'advance' &&
    d.learnerIntent === 'answer' &&
    d.understanding === 'demonstrated' &&
    d.confidence >= 0.9 &&
    d.evidence.length > 0 &&
    d.evidence.every((e) => text.includes(e))
  ) {
    return satisfy(spec, observed, eventId);
  }
  if (
    d.proposedAction === 'give_hint' &&
    d.proposedHintLevel !== null &&
    d.proposedHintLevel > s.hintLevel &&
    d.proposedHintLevel < step.hintLadder.length
  ) {
    return {
      ...observed,
      hintLevel: d.proposedHintLevel,
      attempts: s.attempts + 1,
    };
  }
  return {
    ...observed,
    attempts: s.attempts + (d.understanding === 'incorrect' ? 1 : 0),
  };
}
/** Replay only the active unverified step. Previously verified steps remain satisfied. */
export function recoverCheckpoint(s: TeachingCheckpoint): TeachingCheckpoint {
  if (s.phase === 'completed') return s;
  return {
    ...s,
    phase: 'ready',
    stateVersion: s.stateVersion + 1,
    directive: null,
  };
}
