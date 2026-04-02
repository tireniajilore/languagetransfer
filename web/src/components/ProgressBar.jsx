import React from 'react';

export function ProgressBar({ current, total, lessonTitle }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>{lessonTitle}</span>
        <span style={styles.count}>{current + 1} / {total}</span>
      </div>
      <div style={styles.barContainer}>
        <div style={{ ...styles.bar, width: `${percentage}%` }} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#666',
  },
  title: {
    fontWeight: '600',
    color: '#333',
  },
  count: {
    color: '#888',
  },
  barContainer: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#667eea',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  }
};
