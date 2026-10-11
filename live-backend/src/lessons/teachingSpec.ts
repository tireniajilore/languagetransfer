import { createHash } from 'node:crypto';
import { z } from 'zod';
import auditedLesson2 from './specs/lesson-02.json';
import { getAuthoredLesson } from './conductor';

const StepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['explanation', 'question']),
  text: z.string().min(1).max(20000),
  sourceTurnIds: z.array(z.string()).min(1),
  sourceTranscript: z.array(z.string()).min(1),
  pedagogicalGoal: z.string(),
  requiredIdeas: z.array(z.string()),
  requiredExamples: z.array(z.string()),
  expectedAnswers: z.array(z.string()),
  understandingRubric: z.array(z.string()),
  commonMisconceptions: z.array(z.string()),
  hintLadder: z.array(z.string()),
  completion: z.enum(['delivery', 'understanding']),
  required: z.literal(true),
});
export type TeachingStep = z.infer<typeof StepSchema>;
export interface TeachingSpecification {
  number: number;
  title: string;
  version: string;
  steps: TeachingStep[];
  reviewStatus: string;
  reviewNotes: string[];
}
const cache = new Map<number, TeachingSpecification>();
export function getTeachingSpec(number: number): TeachingSpecification {
  const cached = cache.get(number);
  if (cached) return cached;
  const legacy = getAuthoredLesson(number);
  const steps =
    number === 2
      ? auditedLesson2.steps
      : legacy.steps.map((step) => ({
          ...step,
          sourceTurnIds: [step.id],
          sourceTranscript: [step.text],
          pedagogicalGoal: step.text,
          requiredIdeas: [step.text],
          requiredExamples: [],
          understandingRubric: [
            'Demonstrate the discovery requested by the question; acknowledgments are insufficient.',
          ],
          commonMisconceptions: [],
          hintLadder: [],
          completion: step.kind === 'question' ? 'understanding' : 'delivery',
        }));
  const parsed = z.array(StepSchema).min(1).parse(steps);
  if (new Set(parsed.map((s) => s.id)).size !== parsed.length)
    throw new Error('duplicate teaching step');
  const version = createHash('sha256')
    .update(JSON.stringify(parsed))
    .digest('hex');
  const spec = {
    number,
    title: legacy.title,
    version,
    steps: parsed,
    reviewStatus:
      number === 2 ? auditedLesson2.reviewStatus : 'legacy-unreviewed',
    reviewNotes:
      number === 2
        ? auditedLesson2.reviewNotes
        : ['Not approved for supervised teaching rollout.'],
  };
  cache.set(number, spec);
  return spec;
}
