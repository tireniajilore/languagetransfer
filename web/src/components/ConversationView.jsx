import React, { useEffect, useRef } from 'react';
import { useConversation } from '../hooks/useConversation';

export function ConversationView({ lessonNumber, onBack, onComplete }) {
  const {
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
  } = useConversation(lessonNumber);

  const transcriptEndRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  // Handle completion
  useEffect(() => {
    if (playbackState === PlaybackState.COMPLETE && onComplete) {
      onComplete(lessonNumber);
    }
  }, [playbackState, lessonNumber, onComplete, PlaybackState.COMPLETE]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>Starting lesson...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>Error: {error}</p>
          <button onClick={onBack} style={styles.backButton}>
            Back to Lessons
          </button>
        </div>
      </div>
    );
  }

  const isWaiting = playbackState === PlaybackState.WAITING;
  const isRecording = playbackState === PlaybackState.RECORDING;
  const isPlaying = playbackState === PlaybackState.PLAYING;
  const isPaused = playbackState === PlaybackState.PAUSED;
  const isEvaluating = playbackState === PlaybackState.EVALUATING;
  const isComplete = playbackState === PlaybackState.COMPLETE;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          Back
        </button>
        <h1 style={styles.title}>Lesson {lessonNumber}</h1>
      </header>

      {/* Lesson title */}
      <div style={styles.lessonInfo}>
        <span style={styles.lessonTitle}>{lessonTitle}</span>
      </div>

      {/* Transcript area */}
      <div style={styles.transcriptContainer}>
        <div style={styles.transcript}>
          {transcript.map((entry, index) => (
            <TranscriptEntry key={index} entry={entry} />
          ))}

          {/* Waiting indicator */}
          {isWaiting && (
            <div style={styles.waitingIndicator}>
              <span style={styles.dots}>...</span>
              {silenceSeconds >= 5 && silenceSeconds < 10 && (
                <span style={styles.hint}>Take your time...</span>
              )}
              {silenceSeconds >= 10 && (
                <span style={styles.hint}>Whenever you're ready...</span>
              )}
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div style={styles.recordingIndicator}>
              <span style={styles.recordingDot}></span>
              <span>Recording...</span>
            </div>
          )}

          {/* Evaluating indicator */}
          {isEvaluating && (
            <div style={styles.evaluatingIndicator}>
              <span>Evaluating...</span>
            </div>
          )}

          {/* Complete message */}
          {isComplete && (
            <div style={styles.completeMessage}>
              <p>Lesson complete!</p>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {isWaiting && (
          <>
            <button
              onClick={startRecording}
              style={styles.recordButton}
            >
              Record
            </button>
            <button
              onClick={skip}
              style={styles.skipButton}
            >
              Skip
            </button>
            <button
              onClick={pause}
              style={styles.pauseButton}
            >
              Pause
            </button>
          </>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            style={styles.stopButton}
          >
            Stop
          </button>
        )}

        {isPlaying && (
          <button
            onClick={pause}
            style={styles.pauseButton}
          >
            Pause
          </button>
        )}

        {isPaused && (
          <button
            onClick={resume}
            style={styles.resumeButton}
          >
            Resume
          </button>
        )}

        {isComplete && (
          <button
            onClick={onBack}
            style={styles.doneButton}
          >
            Done
          </button>
        )}
      </div>

      {/* Progress indicator - subtle, thin line */}
      {!isComplete && currentTurn && (
        <div style={styles.progressContainer}>
          <div
            style={{
              ...styles.progressBar,
              width: `${(currentTurn.turn_index / totalTurns) * 100}%`
            }}
          />
        </div>
      )}
    </div>
  );
}

function TranscriptEntry({ entry }) {
  const isTutor = entry.speaker === 'tutor';
  const isSkipped = entry.text === '(skipped)';

  return (
    <div style={{
      ...styles.entry,
      ...(isTutor ? styles.tutorEntry : styles.studentEntry)
    }}>
      {isTutor ? (
        <p style={styles.tutorText}>{entry.text}</p>
      ) : (
        <div style={styles.studentResponse}>
          <p style={{
            ...styles.studentText,
            ...(isSkipped ? styles.skippedText : {}),
            ...(entry.isCorrect === true ? styles.correctText : {}),
            ...(entry.isCorrect === false ? styles.incorrectText : {})
          }}>
            {entry.text}
          </p>
          {entry.isCorrect === false && entry.expected && (
            <p style={styles.expectedText}>Expected: {entry.expected}</p>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    maxWidth: '700px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#fff',
    margin: 0,
  },
  backButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  lessonInfo: {
    marginBottom: '16px',
  },
  lessonTitle: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  transcriptContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  transcript: {
    height: '100%',
    overflowY: 'auto',
    padding: '20px',
  },
  entry: {
    marginBottom: '16px',
  },
  tutorEntry: {
    paddingRight: '40px',
  },
  studentEntry: {
    paddingLeft: '40px',
    textAlign: 'right',
  },
  tutorText: {
    color: '#fff',
    fontSize: '16px',
    lineHeight: '1.5',
    margin: 0,
  },
  studentResponse: {},
  studentText: {
    color: '#a0d2db',
    fontSize: '16px',
    lineHeight: '1.5',
    margin: 0,
  },
  correctText: {
    color: '#4ade80',
  },
  incorrectText: {
    color: '#f87171',
  },
  skippedText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic',
  },
  expectedText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
    marginTop: '4px',
    margin: 0,
  },
  waitingIndicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  dots: {
    fontSize: '24px',
    letterSpacing: '4px',
    animation: 'pulse 1.5s infinite',
  },
  hint: {
    fontSize: '14px',
    fontStyle: 'italic',
  },
  recordingIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '20px',
    color: '#f87171',
  },
  recordingDot: {
    width: '12px',
    height: '12px',
    backgroundColor: '#f87171',
    borderRadius: '50%',
    animation: 'pulse 1s infinite',
  },
  evaluatingIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  completeMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#4ade80',
    fontSize: '18px',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  recordButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#667eea',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
  },
  stopButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#e74c3c',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(231, 76, 60, 0.4)',
    animation: 'pulse 1s infinite',
  },
  skipButton: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
  },
  pauseButton: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
  },
  resumeButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#667eea',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
  },
  doneButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#4ade80',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
  },
  progressContainer: {
    height: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transition: 'width 0.3s ease',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: '#fff',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderTop: '4px solid #fff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: '#f87171',
    textAlign: 'center',
  },
};
