'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveEvaluationRecorder,
  downloadEvaluationFile,
} from '@/lib/live-evaluation';
import {
  LiveConnState,
  LessonProgress,
  LiveVoiceSession,
  TranscriptEntry,
} from '@/lib/live-voice-session';

const SPEAKING_THRESHOLD = 0.02; // RMS of the time-domain signal
const SPEAKING_HANGOVER_MS = 800; // keep "speaking" lit briefly after audio stops

/**
 * Monitors the RMS audio level of a stream and reports speaking/not-speaking.
 * Used for both the mic (user) and the remote track (tutor) so the UI can
 * show interruption state. This is local signal measurement, not model state.
 */
function monitorAudioLevel(
  stream: MediaStream,
  onSpeaking: (speaking: boolean) => void,
  onContext?: (context: AudioContext) => void,
): () => void {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  onContext?.(ctx);
  void ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let raf = 0;
  let hangoverUntil = 0;
  const tick = () => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const now = performance.now();
    if (rms > SPEAKING_THRESHOLD) hangoverUntil = now + SPEAKING_HANGOVER_MS;
    onSpeaking(now < hangoverUntil);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    source.disconnect();
    void ctx.close().catch(() => undefined);
  };
}

export interface UseLiveSessionResult {
  connState: LiveConnState;
  transcripts: TranscriptEntry[];
  sessionId: string | null;
  error: string | null;
  assistantSpeaking: boolean;
  userSpeaking: boolean;
  backendConfigured: boolean;
  playbackBlocked: boolean;
  lessonProgress: LessonProgress | null;
  enableAudio: () => Promise<void>;
  evaluationRecording: boolean;
  startEvaluationRecording: () => void;
  saveEvaluation: () => Promise<void>;
  audioRef: React.RefObject<HTMLAudioElement>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Thin React binding over LiveVoiceSession. The session object is the
 * source of truth; this hook only mirrors its callbacks into state.
 */
export function useLiveSession(lessonNumber?: number): UseLiveSessionResult {
  const backendUrl = process.env.NEXT_PUBLIC_LIVE_BACKEND_URL ?? '';
  const [evaluationRecording, setEvaluationRecording] = useState(false);
  const evaluationRecorder = useRef<LiveEvaluationRecorder | null>(null);
  const evaluationStreams = useRef<{
    local?: MediaStream;
    remote?: MediaStream;
  }>({});
  const [connState, setConnState] = useState<LiveConnState>('idle');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress | null>(
    null,
  );
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionRef = useRef<LiveVoiceSession | null>(null);
  const activity = useRef({ user: false, assistant: false });
  const levelContexts = useRef<AudioContext[]>([]);
  const levelCleanups = useRef<Array<() => void>>([]);

  const teardownLevels = useCallback(() => {
    for (const cleanup of levelCleanups.current) cleanup();
    levelCleanups.current = [];
    levelContexts.current = [];
    activity.current = { user: false, assistant: false };
    setAssistantSpeaking(false);
    setUserSpeaking(false);
  }, []);

  useEffect(
    () => () => {
      teardownLevels();
      void evaluationRecorder.current?.stop().catch(() => undefined);
      void sessionRef.current?.stop().catch(() => undefined);
    },
    [teardownLevels],
  );

  const start = useCallback(async () => {
    if (!backendUrl) return;
    setError(null);
    setPlaybackBlocked(false);
    setTranscripts([]);
    setLessonProgress(null);
    teardownLevels();
    let learnerToken: string | undefined;
    try {
      learnerToken =
        window.localStorage.getItem('lt-live-learner-v1') ?? undefined;
    } catch {
      /* storage disabled */
    }
    const session = new LiveVoiceSession({
      backendUrl,
      learnerToken,
      lessonNumber,
      onLessonProgress: setLessonProgress,
      onLearnerToken: (token) => {
        try {
          window.localStorage.setItem('lt-live-learner-v1', token);
        } catch {
          /* storage disabled */
        }
      },
      onStateChange: (s) => {
        setConnState(s);
        if (s === 'connected') setSessionId(session.getSessionId());
        if (s === 'reconnecting') teardownLevels();
        if (s === 'closed' || s === 'failed') {
          teardownLevels();
          setSessionId(null);
        }
      },
      onTranscript: setTranscripts,
      onRemoteStream: (stream) => {
        evaluationStreams.current.remote = stream;
        const el = audioRef.current;
        if (el) {
          el.srcObject = stream;
          void el
            .play()
            .then(() => {
              const blocked = levelContexts.current.some(
                (context) => context.state === 'suspended',
              );
              setPlaybackBlocked(blocked);
              if (blocked)
                setError(
                  'Tap Enable audio to start audio monitoring and hear your tutor.',
                );
            })
            .catch(() => {
              setPlaybackBlocked(true);
              setError(
                'Audio playback was blocked by the browser. Tap Enable audio to hear your tutor.',
              );
            });
        }
        levelCleanups.current.push(
          monitorAudioLevel(
            stream,
            (speaking) => {
              setAssistantSpeaking(speaking);
              if (activity.current.assistant !== speaking) {
                activity.current.assistant = speaking;
                const el = audioRef.current;
                void session
                  .reportActivity(
                    'assistant',
                    speaking,
                    !!el && !el.paused && !el.muted && el.volume > 0,
                  )
                  .catch(() => undefined);
              }
            },
            (context) => {
              levelContexts.current.push(context);
            },
          ),
        );
      },
      onLocalStream: (stream) => {
        evaluationStreams.current.local = stream;
        levelCleanups.current.push(
          monitorAudioLevel(
            stream,
            (speaking) => {
              setUserSpeaking(speaking);
              if (activity.current.user !== speaking) {
                activity.current.user = speaking;
                void session
                  .reportActivity('user', speaking)
                  .catch(() => undefined);
              }
            },
            (context) => {
              levelContexts.current.push(context);
            },
          ),
        );
      },
      onError: (e) => setError(e.message),
    });
    sessionRef.current = session;
    await session.start();
  }, [backendUrl, lessonNumber, teardownLevels]);

  // The backend owns the lesson cursor; periodically display its authenticated status.
  useEffect(() => {
    if (connState !== 'connected' || lessonNumber === undefined) return;
    let active = true;
    const poll = () => {
      if (!active) return;
      void sessionRef.current?.readLessonProgress().catch(() => undefined);
      const el = audioRef.current;
      void sessionRef.current
        ?.reportActivity(
          'assistant',
          activity.current.assistant,
          !!el && !el.paused && !el.muted && el.volume > 0,
        )
        .catch(() => undefined);
      void sessionRef.current
        ?.reportActivity('user', activity.current.user)
        .catch(() => undefined);
    };
    poll();
    const interval = window.setInterval(poll, 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [connState, lessonNumber]);

  const enableAudio = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      await Promise.all([
        el.play(),
        ...levelContexts.current.map((context) => context.resume()),
      ]);
      setPlaybackBlocked(false);
      setError(null);
    } catch {
      setPlaybackBlocked(true);
      setError(
        'Audio is still blocked. Check your iPhone audio settings and try again.',
      );
    }
  }, []);

  const startEvaluationRecording = useCallback(() => {
    const { local, remote } = evaluationStreams.current;
    if (!local || !remote) {
      setError('Connect a teaching session before recording.');
      return;
    }
    try {
      const recorder = new LiveEvaluationRecorder();
      recorder.start(local, remote);
      evaluationRecorder.current = recorder;
      setEvaluationRecording(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const saveEvaluation = useCallback(async () => {
    let trace: unknown;
    try {
      trace = await sessionRef.current?.evaluationTrace();
    } catch {
      setError(
        'The session trace is unavailable; the audio recording can still be downloaded.',
      );
    }
    try {
      const audio = await evaluationRecorder.current?.stop();
      evaluationRecorder.current = null;
      setEvaluationRecording(false);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (trace)
        downloadEvaluationFile(
          new Blob([JSON.stringify(trace, null, 2)], {
            type: 'application/json',
          }),
          `lesson-${lessonNumber}-trace-${stamp}.json`,
        );
      if (audio)
        downloadEvaluationFile(
          audio,
          `lesson-${lessonNumber}-audio-${stamp}.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`,
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [lessonNumber]);

  const stop = useCallback(async () => {
    teardownLevels();
    setPlaybackBlocked(false);
    if (audioRef.current) audioRef.current.srcObject = null;
    if (evaluationRecorder.current) await saveEvaluation();
    await sessionRef.current?.stop().catch(() => undefined);
    sessionRef.current = null;
  }, [teardownLevels, saveEvaluation]);

  return {
    connState,
    transcripts,
    sessionId,
    error,
    assistantSpeaking,
    userSpeaking,
    backendConfigured: backendUrl.length > 0,
    lessonProgress,
    playbackBlocked,
    enableAudio,
    evaluationRecording,
    startEvaluationRecording,
    saveEvaluation,
    audioRef,
    start,
    stop,
  };
}
