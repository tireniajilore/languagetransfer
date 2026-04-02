import React from 'react';

export function AudioRecorder({ isRecording, onStart, onStop, disabled }) {
  const handleClick = () => {
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        ...styles.button,
        ...(isRecording ? styles.recording : {}),
        ...(disabled ? styles.disabled : {})
      }}
    >
      <span style={styles.icon}>{isRecording ? '⏹️' : '🎤'}</span>
      <span style={styles.text}>
        {isRecording ? 'Stop Recording' : 'Hold to Record'}
      </span>
    </button>
  );
}

const styles = {
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#667eea',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
  },
  recording: {
    backgroundColor: '#e74c3c',
    animation: 'pulse 1s infinite',
    boxShadow: '0 4px 15px rgba(231, 76, 60, 0.4)',
  },
  disabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  icon: {
    fontSize: '24px',
  },
  text: {
    fontSize: '16px',
  }
};
