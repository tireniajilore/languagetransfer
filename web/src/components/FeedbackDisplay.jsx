import React from 'react';

export function FeedbackDisplay({ evaluation, userTranscript, onRetry, onNext, isLastExercise }) {
  if (!evaluation) return null;

  const isCorrect = evaluation.is_correct;
  const feedbackType = evaluation.feedback_type;

  return (
    <div style={styles.container}>
      {/* User's answer */}
      <div style={styles.transcriptBox}>
        <span style={styles.label}>You said:</span>
        <span style={styles.transcript}>"{userTranscript}"</span>
      </div>

      {/* Feedback */}
      <div style={{
        ...styles.feedbackBox,
        backgroundColor: isCorrect ? '#d4edda' : feedbackType === 'close' ? '#fff3cd' : '#f8d7da',
        borderColor: isCorrect ? '#28a745' : feedbackType === 'close' ? '#ffc107' : '#dc3545',
      }}>
        <span style={styles.feedbackIcon}>
          {isCorrect ? '✅' : feedbackType === 'close' ? '🔶' : '❌'}
        </span>
        <div style={styles.feedbackContent}>
          <p style={styles.feedbackMessage}>{evaluation.feedback_en}</p>
          {evaluation.correct_spanish && (
            <p style={styles.correctAnswer}>
              Correct answer: <strong>{evaluation.correct_spanish}</strong>
            </p>
          )}
          {evaluation.specific_issue && !isCorrect && (
            <p style={styles.issue}>Issue: {evaluation.specific_issue}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        {!isCorrect && (
          <button onClick={onRetry} style={styles.retryButton}>
            🔄 Try Again
          </button>
        )}
        <button
          onClick={onNext}
          style={styles.nextButton}
          disabled={!isCorrect && feedbackType === 'retry'}
        >
          {isLastExercise ? '🎉 Complete Lesson' : '➡️ Next Exercise'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    marginTop: '20px',
  },
  transcriptBox: {
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  label: {
    fontSize: '14px',
    color: '#666',
    marginRight: '8px',
  },
  transcript: {
    fontSize: '16px',
    fontStyle: 'italic',
    color: '#333',
  },
  feedbackBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    borderRadius: '8px',
    border: '2px solid',
    marginBottom: '16px',
  },
  feedbackIcon: {
    fontSize: '32px',
  },
  feedbackContent: {
    flex: 1,
  },
  feedbackMessage: {
    fontSize: '16px',
    margin: '0 0 8px 0',
    color: '#333',
  },
  correctAnswer: {
    fontSize: '15px',
    margin: '0 0 4px 0',
    color: '#155724',
  },
  issue: {
    fontSize: '14px',
    margin: '0',
    color: '#856404',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  retryButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#6c757d',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  nextButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#28a745',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  }
};
