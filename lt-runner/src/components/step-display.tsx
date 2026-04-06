import type { LessonStep } from '@/types/lesson';

interface StepDisplayProps {
  step?: LessonStep;
  mode: string;
}

const labels: Record<LessonStep['type'], string> = {
  narration: 'Tutor',
  reveal: 'Tutor Feedback',
  prompt: 'Your Turn',
  open_prompt: 'Try It',
  instruction: 'Instruction',
  pause: 'Pause'
};

export function StepDisplay({ step, mode }: StepDisplayProps) {
  if (!step) {
    return (
      <section className="rounded-[2rem] bg-white/80 p-6 shadow-panel backdrop-blur">
        <p className="text-sm uppercase tracking-[0.25em] text-ink/50">Keep Going</p>
        <h2 className="mt-3 text-2xl font-semibold text-ink">That pattern is yours now.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
          If you would want the next lesson in this format, tell me below. That will shape what I build next.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] bg-white/85 p-6 shadow-panel backdrop-blur">
      <p className="text-sm uppercase tracking-[0.25em] text-ink/50">{labels[step.type]}</p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight text-ink md:text-3xl">
        {step.text}
      </h2>
      <div className="mt-5 flex items-center gap-3 text-sm text-ink/55">
        <span className="rounded-full bg-mist px-3 py-1 font-medium">{step.type}</span>
        <span>Mode: {mode.replaceAll('_', ' ')}</span>
      </div>
    </section>
  );
}
