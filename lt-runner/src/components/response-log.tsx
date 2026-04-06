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
    <section className="rounded-[2rem] bg-white/70 p-3 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Response log</h3>
        <span className="text-xs text-ink/50">{responses.length} entries</span>
      </div>

      {responses.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-ink/50">
          Responses appear here as you answer prompts.
        </p>
      ) : (
        <ul className="mt-3 max-h-[360px] space-y-1.5 overflow-y-auto">
          {responses.map((response) => (
            <li key={`${response.stepId}-${response.kind}-${response.stepIndex}`} className="rounded-xl border border-ink/10 bg-white/80 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink/60">{labelForKind(response.kind)}</p>
                <p className="text-xs text-ink/35">#{response.stepIndex + 1}</p>
              </div>
              <p className="mt-1 text-xs text-ink/50 line-clamp-1">{response.promptText}</p>
              <p className="mt-1 text-xs font-medium text-ink">
                {response.response || <span className="italic text-ink/40">—</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
