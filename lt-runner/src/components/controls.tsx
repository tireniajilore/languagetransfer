interface ControlsProps {
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRestart: () => void;
}

function controlButtonClass(emphasis: 'primary' | 'secondary' = 'secondary') {
  return emphasis === 'primary'
    ? 'rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/30'
    : 'rounded-full border border-ink/15 bg-white/70 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:text-ink/30';
}

export function Controls({
  canStart,
  canPause,
  canResume,
  canGoPrevious,
  canGoNext,
  onStart,
  onPause,
  onResume,
  onPrevious,
  onNext,
  onRestart
}: ControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className={controlButtonClass('primary')} onClick={onStart} disabled={!canStart}>
        Start
      </button>
      <button className={controlButtonClass()} onClick={onPause} disabled={!canPause}>
        Pause
      </button>
      <button className={controlButtonClass()} onClick={onResume} disabled={!canResume}>
        Resume
      </button>
      <button className={controlButtonClass()} onClick={onPrevious} disabled={!canGoPrevious}>
        Previous
      </button>
      <button className={controlButtonClass()} onClick={onNext} disabled={!canGoNext}>
        Next
      </button>
      <button className={controlButtonClass()} onClick={onRestart}>
        Restart
      </button>
    </div>
  );
}
