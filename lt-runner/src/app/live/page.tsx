'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useLiveSession } from '@/hooks/useLiveSession';
import { LiveConnState } from '@/lib/live-voice-session';

const STATE_LABELS: Record<LiveConnState, string> = {
  idle: 'Idle',
  'requesting-mic': 'Requesting microphone…',
  'creating-offer': 'Preparing audio…',
  'exchanging-sdp': 'Connecting to tutor…',
  'establishing-media': 'Establishing audio…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  failed: 'Connection failed',
  closed: 'Session ended',
};

const STATE_STYLES: Record<LiveConnState, string> = {
  idle: 'bg-stone-200 text-stone-700',
  'requesting-mic': 'bg-amber-200 text-amber-900',
  'creating-offer': 'bg-amber-200 text-amber-900',
  'exchanging-sdp': 'bg-amber-200 text-amber-900',
  'establishing-media': 'bg-amber-200 text-amber-900',
  connected: 'bg-emerald-200 text-emerald-900',
  reconnecting: 'bg-amber-200 text-amber-900',
  failed: 'bg-red-200 text-red-900',
  closed: 'bg-stone-200 text-stone-700',
};

export default function LiveTutorPage() {
  // PR 5 rollout gate: the route renders the tutor only when explicitly
  // enabled. Set NEXT_PUBLIC_LIVE_TUTOR_ENABLED=1 on Vercel (staging first).
  // Defaults to OFF so merging the live-tutor stack never exposes the route
  // to production traffic by accident.
  const liveTutorEnabled = process.env.NEXT_PUBLIC_LIVE_TUTOR_ENABLED === '1';

  const {
    connState,
    transcripts,
    error,
    assistantSpeaking,
    userSpeaking,
    backendConfigured,
    playbackBlocked,
    enableAudio,
    audioRef,
    start,
    stop,
  } = useLiveSession();
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  if (!liveTutorEnabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
        <header>
          <h1 className="font-display text-3xl font-semibold">Live Spanish Tutor</h1>
          <p className="mt-2 text-sm text-stone-600">
            The real-time voice tutor is not enabled in this environment.
          </p>
        </header>
        <div className="rounded-lg border border-stone-300 bg-stone-50 p-4 text-sm text-stone-700">
          This route is behind the <code className="font-mono">NEXT_PUBLIC_LIVE_TUTOR_ENABLED</code>{' '}
          flag. The scripted lessons remain available:{' '}
          <Link href="/" className="underline">
            back to lessons
          </Link>
          .
        </div>
      </main>
    );
  }

  const busy =
    connState === 'requesting-mic' ||
    connState === 'creating-offer' ||
    connState === 'exchanging-sdp' ||
    connState === 'establishing-media' ||
    connState === 'reconnecting';
  const live = connState === 'connected';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">Live Spanish Tutor</h1>
            <span className="rounded-full bg-violet-200 px-2 py-0.5 text-xs font-medium text-violet-900">
              Experimental
            </span>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            A real-time voice conversation with an AI teacher using the Thinking
            Method. Speak naturally — you can interrupt and ask questions.
          </p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-stone-500 underline">
          Scripted lessons
        </Link>
      </header>

      {!backendConfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The live backend is not configured.{' '}
          <code className="font-mono">NEXT_PUBLIC_LIVE_BACKEND_URL</code> must point
          at the deployed <code className="font-mono">live-backend</code> service
          before a session can start.
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATE_STYLES[connState]}`}>
          {STATE_LABELS[connState]}
        </span>
        {live && (
          <span className="flex items-center gap-2 text-sm text-stone-600">
            <SpeakingDot active={assistantSpeaking} label="Tutor" />
            <SpeakingDot active={userSpeaking} label="You" />
          </span>
        )}
      </div>

      <div className="flex gap-3">
        {!live && !busy && (
          <button
            onClick={start}
            disabled={!backendConfigured}
            className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start voice session
          </button>
        )}
        {playbackBlocked && (
          <button
            onClick={() => void enableAudio()}
            className="rounded-lg bg-amber-200 px-5 py-2.5 text-sm font-medium text-amber-950"
          >
            Enable audio
          </button>
        )}
        {(live || busy) && (
          <button
            onClick={stop}
            className="rounded-lg bg-stone-200 px-5 py-2.5 text-sm font-medium text-stone-800"
          >
            End session
          </button>
        )}
        {connState === 'failed' && (
          <button
            onClick={start}
            disabled={!backendConfigured}
            className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Try again
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      <section aria-label="Conversation transcript" className="flex-1">
        <h2 className="mb-2 text-sm font-medium text-stone-500">Transcript</h2>
        <div
          ref={transcriptRef}
          className="flex h-96 flex-col gap-3 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-4"
        >
          {transcripts.length === 0 && (
            <p className="text-sm text-stone-400">
              {live
                ? 'Say hola to begin…'
                : 'Your conversation will appear here once the session starts.'}
            </p>
          )}
          {transcripts.map((entry) => (
            <div
              key={entry.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                entry.speaker === 'assistant'
                  ? 'self-start bg-white shadow-sm'
                  : 'self-end bg-stone-900 text-white'
              }`}
            >
              <span className="mb-0.5 block text-[11px] font-medium opacity-60">
                {entry.speaker === 'assistant' ? 'Tutor' : 'You'}
              </span>
              {entry.text}
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-stone-400">
        The scripted lesson player is preserved and unchanged — this live tutor is
        a separate experimental route. Microphone audio is streamed to the tutor
        in real time; transcripts are shown here for the session.
      </p>

      <audio ref={audioRef} autoPlay playsInline className="hidden" />
    </main>
  );
}

function SpeakingDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full transition-colors ${
          active ? 'bg-emerald-500' : 'bg-stone-300'
        }`}
        aria-hidden
      />
      <span className={active ? 'font-medium text-stone-800' : ''}>
        {label}
        {active ? ' speaking' : ''}
      </span>
    </span>
  );
}
