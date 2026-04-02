import type { ResponseRecord } from '@/types/engine';

interface ResponseLogProps {
  responses: ResponseRecord[];
}

function labelForKind(kind: ResponseRecord['kind']) {
  if (kind === 'submitted') return 'Answered';
  if (kind === 'skipped') return 'Skipped';
  return 'Timed Out';
}

export function ResponseLog({ responses }: ResponseLogProps) {
  return (
    <section className="rounded-[2rem] bg-white/70 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">Response log</h3>
        <span className="text-sm text-ink/50">{responses.length} entries</span>
      </div>

      {responses.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-ink/55">
          Your responses will appear here as the lesson moves through prompts.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {responses.map((response) => (
            <li key={`${response.stepId}-${response.kind}-${response.stepIndex}`} className="rounded-2xl border border-ink/10 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink/60">{labelForKind(response.kind)}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Step {response.stepIndex + 1}</p>
              </div>
              <p className="mt-2 text-sm text-ink/60">{response.promptText}</p>
              <p className="mt-3 text-base font-medium text-ink">
                {response.response || <span className="italic text-ink/45">No response captured</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
