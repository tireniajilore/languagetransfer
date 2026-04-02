'use client';

import { useEffect, useRef } from 'react';

interface ResponseInputProps {
  enabled: boolean;
  value: string;
  acceptedAnswers?: string[];
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}

export function ResponseInput({
  enabled,
  value,
  acceptedAnswers,
  onChange,
  onSubmit,
  onSkip
}: ResponseInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (enabled) {
      inputRef.current?.focus();
    }
  }, [enabled]);

  return (
    <section className="rounded-[2rem] bg-white/80 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label htmlFor="response" className="text-sm font-medium text-ink/70">
            Type your response
          </label>
          <input
            id="response"
            ref={inputRef}
            value={value}
            disabled={!enabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && enabled) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={enabled ? 'Answer in Spanish...' : 'Response input activates at prompts'}
            className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-ink/30 disabled:bg-slate-50"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onSubmit}
            disabled={!enabled}
            className="rounded-full bg-leaf px-5 py-3 text-sm font-semibold text-white transition hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-leaf/30"
          >
            Submit
          </button>
          <button
            onClick={onSkip}
            disabled={!enabled}
            className="rounded-full border border-ink/15 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white/90 disabled:cursor-not-allowed disabled:text-ink/30"
          >
            Skip
          </button>
        </div>
      </div>
      {acceptedAnswers?.length ? (
        <p className="mt-4 text-sm text-ink/50">
          Reference answers: {acceptedAnswers.join(', ')}
        </p>
      ) : null}
    </section>
  );
}
