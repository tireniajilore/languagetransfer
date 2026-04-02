import React, { useState, useEffect, useRef } from 'react';
import { AudioRecorder } from './AudioRecorder';
import { FeedbackDisplay } from './FeedbackDisplay';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { transcribeAudio, evaluateAnswer, speakText } from '../api/tutor';

export function ExerciseCard({ exercise, lessonTitle, onComplete, isLastExercise }) {
  const [phase, setPhase] = useState('prompt'); // prompt | recording | processing | feedback
  const [evaluation, setEvaluation] = useState(null);
  const [userTranscript, setUserTranscript] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const audioRef = useRef(new Audio());
  const { isRecording, audioBlob, error, startRecording, stopRecording, clearRecording } = useAudioRecorder();

  // Reset state when exercise changes
  useEffect(() => {
    setPhase('prompt');
    setEvaluation(null);
    setUserTranscript('');
    setAttempts(0);
    clearRecording();
  }, [exercise?.id]);

  // Play prompt when exercise loads
  useEffect(() => {
    if (exercise && phase === 'prompt') {
      playPrompt();
    }
  }, [exercise?.id]);

  // Process audio when recording stops
  useEffect(() => {
    if (audioBlob && phase === 'recording') {
      processAudio();
    }
  }, [audioBlob]);

  const playPrompt = async () => {
    try {
      setIsPlayingAudio(true);
      const audioBlob = await speakText(exercise.prompt, 'en');
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current.src = audioUrl;
      audioRef.current.onended = () => {
        setIsPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
      };
      await audioRef.current.play();
    } catch (err) {
      console.error('Failed to play prompt:', err);
      setIsPlayingAudio(false);
    }
  };

  const handleStartRecording = () => {
    setPhase('recording');
    startRecording();
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const processAudio = async () => {
    setPhase('processing');
    try {
      // Transcribe the audio
      const transcription = await transcribeAudio(audioBlob);
      setUserTranscript(transcription.text);

      // Evaluate the answer
      const result = await evaluateAnswer(
        exercise.prompt,
        exercise.expected_answers,
        transcription.text,
        lessonTitle
      );
      setEvaluation(result);
      setAttempts(prev => prev + 1);
      setPhase('feedback');

      // Play the correct answer in Spanish
      if (result.correct_spanish) {
        setTimeout(async () => {
          try {
            const correctAudio = await speakText(result.correct_spanish, 'es');
            const audioUrl = URL.createObjectURL(correctAudio);
            audioRef.current.src = audioUrl;
            audioRef.current.onended = () => URL.revokeObjectURL(audioUrl);
            await audioRef.current.play();
          } catch (err) {
            console.error('Failed to play correct answer:', err);
          }
        }, 500);
      }
    } catch (err) {
      console.error('Processing error:', err);
      setPhase('prompt');
    }
  };

  const handleRetry = () => {
    setPhase('prompt');
    setEvaluation(null);
    setUserTranscript('');
    clearRecording();
    setTimeout(playPrompt, 300);
  };

  const handleNext = () => {
    if (onComplete) {
      onComplete(evaluation?.is_correct || false, attempts);
    }
  };

  if (!exercise) {
    return <div style={styles.loading}>Loading exercise...</div>;
  }

  return (
    <div style={styles.card}>
      {/* Prompt Section */}
      <div style={styles.promptSection}>
        <button
          onClick={playPrompt}
          style={styles.playButton}
          disabled={isPlayingAudio || phase === 'processing'}
        >
          🔊
        </button>
        <p style={styles.promptText}>{exercise.prompt}</p>
      </div>

      {/* Hint (if available) */}
      {exercise.hint && (
        <p style={styles.hint}>💡 {exercise.hint}</p>
      )}

      {/* Recording Section */}
      {(phase === 'prompt' || phase === 'recording') && (
        <div style={styles.recordSection}>
          <AudioRecorder
            isRecording={isRecording}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
            disabled={isPlayingAudio}
          />
          {error && <p style={styles.error}>{error}</p>}
        </div>
      )}

      {/* Processing Indicator */}
      {phase === 'processing' && (
        <div style={styles.processing}>
          <div style={styles.spinner}></div>
          <p>Analyzing your answer...</p>
        </div>
      )}

      {/* Feedback Section */}
      {phase === 'feedback' && (
        <FeedbackDisplay
          evaluation={evaluation}
          userTranscript={userTranscript}
          onRetry={handleRetry}
          onNext={handleNext}
          isLastExercise={isLastExercise}
        />
      )}
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '600px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  promptSection: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
  },
  playButton: {
    fontSize: '28px',
    padding: '8px',
    backgroundColor: '#f0f0f0',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    flexShrink: 0,
  },
  promptText: {
    fontSize: '22px',
    fontWeight: '500',
    color: '#333',
    margin: 0,
    lineHeight: 1.4,
  },
  hint: {
    fontSize: '14px',
    color: '#666',
    backgroundColor: '#fff9e6',
    padding: '10px 14px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  recordSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  error: {
    color: '#dc3545',
    fontSize: '14px',
  },
  processing: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
    color: '#666',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  }
};
