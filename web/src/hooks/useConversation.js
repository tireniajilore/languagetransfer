import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startConversation,
  getCurrentTurn,
  getTurnAudio,
  getNudgeAudio,
  submitResponse,
  advanceTurn
} from '../api/tutor';

// Playback states
const PlaybackState = {
  IDLE: 'idle',
  PLAYING: 'playing',
  WAITING: 'waiting',
  RECORDING: 'recording',
  EVALUATING: 'evaluating',
  PAUSED: 'paused',
  COMPLETE: 'complete'
};

const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg'
];

function getSupportedRecordingMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return '';
  }

  if (typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  return RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

function getRecordingExtension(mimeType) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}

/**
 * Hook for managing conversation state and playback
 */
export function useConversation(lessonNumber) {
  const [sessionId, setSessionId] = useState(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [totalTurns, setTotalTurns] = useState(0);

  const [currentTurn, setCurrentTurn] = useState(null);
  const [playbackState, setPlaybackState] = useState(PlaybackState.IDLE);
  const [transcript, setTranscript] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [lastEvaluation, setLastEvaluation] = useState(null);
  const [silenceSeconds, setSilenceSeconds] = useState(0);

  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const nudgePlayedRef = useRef(false);
  const audioUrlRef = useRef(null);
  const recordingMimeTypeRef = useRef('');
  const playedTutorTurnsRef = useRef(new Set());

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const enterWaitingState = useCallback(() => {
    clearSilenceTimer();
    setPlaybackState(PlaybackState.WAITING);
    setSilenceSeconds(0);
    nudgePlayedRef.current = false;
    silenceTimerRef.current = setInterval(() => {
      setSilenceSeconds((prev) => prev + 1);
    }, 1000);
  }, [clearSilenceTimer]);

  const setTurnState = useCallback((turn) => {
    setCurrentTurn(turn);

    if (!turn) {
      setPlaybackState(PlaybackState.COMPLETE);
      return;
    }

    if (turn.speaker === 'student') {
      enterWaitingState();
      return;
    }

    setPlaybackState(PlaybackState.IDLE);
  }, [enterWaitingState]);

  // Initialize session
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        setTranscript([]);
        setLastEvaluation(null);
        setCurrentTurn(null);
        setPlaybackState(PlaybackState.IDLE);
        setSilenceSeconds(0);
        playedTutorTurnsRef.current = new Set();
        clearSilenceTimer();

        const session = await startConversation(lessonNumber);
        if (cancelled) return;

        setSessionId(session.session_id);
        setLessonTitle(session.title);
        setTotalTurns(session.total_turns);

        // Get first turn
        const turn = await getCurrentTurn(session.session_id);
        if (cancelled) return;

        setTurnState(turn);

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      clearSilenceTimer();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [lessonNumber, clearSilenceTimer, setTurnState]);

  // Play tutor turn
  const playTutorTurn = useCallback(async (turnToPlay = currentTurn) => {
    if (!sessionId || !turnToPlay || turnToPlay.speaker !== 'tutor') return;

    try {
      clearSilenceTimer();
      setError(null);
      setPlaybackState(PlaybackState.PLAYING);

      const audioBlob = await getTurnAudio(sessionId);
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      audioUrlRef.current = audioUrl;

      if (!playedTutorTurnsRef.current.has(turnToPlay.turn_index)) {
        playedTutorTurnsRef.current.add(turnToPlay.turn_index);
        setTranscript((prev) => [
          ...prev,
          { speaker: 'tutor', text: turnToPlay.text, turnIndex: turnToPlay.turn_index }
        ]);
      }

      // Play audio
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
      }
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError('Audio playback was blocked. Press Resume to continue.');
        setPlaybackState(PlaybackState.PAUSED);
        return;
      }
      setError(err.message);
      setPlaybackState(PlaybackState.IDLE);
    }
  }, [sessionId, currentTurn, clearSilenceTimer]);

  // Handle audio ended
  const handleAudioEnded = useCallback(async () => {
    if (!sessionId) return;

    try {
      const result = await advanceTurn(sessionId);

      if (result.is_complete) {
        setCurrentTurn(null);
        setPlaybackState(PlaybackState.COMPLETE);
        return;
      }

      const turn = await getCurrentTurn(sessionId);
      setTurnState(turn);
    } catch (err) {
      setError(err.message);
      setPlaybackState(PlaybackState.IDLE);
    }
  }, [sessionId, setTurnState]);

  // Setup audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.addEventListener('ended', handleAudioEnded);

    return () => {
      audio.removeEventListener('ended', handleAudioEnded);
      audio.pause();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [handleAudioEnded]);

  // Auto-play first tutor turn when ready
  useEffect(() => {
    if (sessionId && currentTurn && currentTurn.speaker === 'tutor' && playbackState === PlaybackState.IDLE) {
      playTutorTurn(currentTurn);
    }
  }, [sessionId, currentTurn, playbackState, playTutorTurn]);

  // Handle silence nudge
  useEffect(() => {
    async function playNudge() {
      if (silenceSeconds >= 10 && !nudgePlayedRef.current && playbackState === PlaybackState.WAITING) {
        nudgePlayedRef.current = true;
        try {
          const nudgeBlob = await getNudgeAudio(sessionId);
          const nudgeUrl = URL.createObjectURL(nudgeBlob);
          const nudgeAudio = new Audio(nudgeUrl);
          nudgeAudio.volume = 0.7;
          nudgeAudio.play();
        } catch (err) {
          console.error('Nudge audio failed:', err);
        }
      }
    }

    playNudge();
  }, [silenceSeconds, sessionId, playbackState]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (playbackState !== PlaybackState.WAITING) return;

    try {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not support microphone recording.');
      }

      clearSilenceTimer();
      setError(null);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordingMimeTypeRef.current = mediaRecorder.mimeType || mimeType || 'audio/webm';

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setPlaybackState(PlaybackState.RECORDING);
    } catch (err) {
      setError(err.message || 'Microphone access denied');
      enterWaitingState();
    }
  }, [playbackState, clearSilenceTimer, enterWaitingState]);

  // Stop recording and submit
  const stopRecording = useCallback(async () => {
    if (playbackState !== PlaybackState.RECORDING || !mediaRecorderRef.current) return;

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        const mimeType = recordingMimeTypeRef.current || mediaRecorder.mimeType || 'audio/webm';
        const extension = getRecordingExtension(mimeType);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setPlaybackState(PlaybackState.EVALUATING);

        try {
          // Submit response
          const evaluation = await submitResponse(sessionId, blob, `recording.${extension}`);
          setLastEvaluation(evaluation);

          // Add user response to transcript
          setTranscript((prev) => [
            ...prev,
            {
              speaker: 'student',
              text: evaluation.transcribed_text,
              isCorrect: evaluation.is_correct,
              expected: evaluation.correct_spanish,
              turnIndex: currentTurn?.turn_index
            }
          ]);

          // Advance to next turn (feedback)
          const result = await advanceTurn(sessionId);

          if (result.is_complete) {
            setPlaybackState(PlaybackState.COMPLETE);
            setCurrentTurn(null);
          } else {
            const turn = await getCurrentTurn(sessionId);
            setTurnState(turn);
          }

          resolve(evaluation);
        } catch (err) {
          setError(err.message);
          enterWaitingState();
          resolve(null);
        } finally {
          mediaRecorderRef.current = null;
          recordingMimeTypeRef.current = '';
        }

        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.stop();
    });
  }, [playbackState, sessionId, currentTurn, setTurnState, enterWaitingState]);

  // Skip current turn
  const skip = useCallback(async () => {
    if (playbackState !== PlaybackState.WAITING) return;

    clearSilenceTimer();

    try {
      // Add skipped marker to transcript
      setTranscript((prev) => [
        ...prev,
        {
          speaker: 'student',
          text: '(skipped)',
          isCorrect: null,
          expected: currentTurn?.expected_answers?.[0],
          turnIndex: currentTurn?.turn_index
        }
      ]);

      // Advance to next turn
      const result = await advanceTurn(sessionId);

      if (result.is_complete) {
        setPlaybackState(PlaybackState.COMPLETE);
        setCurrentTurn(null);
        return;
      }

      const turn = await getCurrentTurn(sessionId);
      setTurnState(turn);
    } catch (err) {
      setError(err.message);
      enterWaitingState();
    }
  }, [playbackState, sessionId, currentTurn, clearSilenceTimer, setTurnState, enterWaitingState]);

  // Pause/resume
  const pause = useCallback(() => {
    if (playbackState === PlaybackState.PLAYING && audioRef.current) {
      audioRef.current.pause();
      setPlaybackState(PlaybackState.PAUSED);
    } else if (playbackState === PlaybackState.WAITING) {
      clearSilenceTimer();
      setPlaybackState(PlaybackState.PAUSED);
    }
  }, [playbackState, clearSilenceTimer]);

  const resume = useCallback(() => {
    if (playbackState === PlaybackState.PAUSED) {
      if (audioRef.current && audioRef.current.src && currentTurn?.speaker === 'tutor') {
        audioRef.current.play()
          .then(() => {
            setError(null);
            setPlaybackState(PlaybackState.PLAYING);
          })
          .catch((err) => {
            setError(err.message || 'Unable to resume audio playback');
          });
      } else if (currentTurn?.speaker === 'student') {
        enterWaitingState();
      } else if (currentTurn?.speaker === 'tutor') {
        playTutorTurn(currentTurn);
      }
    }
  }, [playbackState, currentTurn, playTutorTurn, enterWaitingState]);

  return {
    sessionId,
    lessonTitle,
    totalTurns,
    currentTurn,
    playbackState,
    transcript,
    loading,
    error,
    lastEvaluation,
    silenceSeconds,

    startRecording,
    stopRecording,
    skip,
    pause,
    resume,

    PlaybackState
  };
}
