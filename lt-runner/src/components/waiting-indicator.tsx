import type { WaitingState } from '@/types/engine';

interface WaitingIndicatorProps {
  waiting: WaitingState | null;
}

function getPrompt(waiting: WaitingState) {
  if (waiting.fallbackMessage) return waiting.fallbackMessage;
  if (waiting.secondsRemaining <= 2) return 'Whenever you are ready...';
  if (waiting.secondsRemaining <= Math.ceil(waiting.totalSeconds / 2)) return 'Take your time...';
  return 'Thinking space.';
}

export function WaitingIndicator({ waiting }: WaitingIndicatorProps) {
  if (!waiting) return null;

  return (
    <div className="rounded-3xl border border-sun/30 bg-sun/10 p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-ink/45">Waiting</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-lg font-medium text-ink">{getPrompt(waiting)}</p>
        <p className="text-2xl font-semibold text-coral">{waiting.secondsRemaining}s</p>
      </div>
    </div>
  );
}
