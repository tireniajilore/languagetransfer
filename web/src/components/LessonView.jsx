import React from 'react';
import { ProgressBar } from './ProgressBar';
import { ExerciseCard } from './ExerciseCard';
import { useLesson } from '../hooks/useLesson';

export function LessonView({ lessonNumber, onLessonComplete, onBack }) {
  const {
    lesson,
    currentExercise,
    currentExerciseIndex,
    totalExercises,
    isLastExercise,
    loading,
    error,
    nextExercise,
    recordAttempt
  } = useLesson(lessonNumber);

  const handleExerciseComplete = async (isCorrect, attempts) => {
    await recordAttempt(isCorrect, attempts);

    if (isLastExercise) {
      if (onLessonComplete) {
        onLessonComplete(lessonNumber);
      }
    } else {
      nextExercise();
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>Loading lesson...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>Failed to load lesson: {error}</p>
          <button onClick={onBack} style={styles.backButton}>
            ← Back to Lessons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ← Back
        </button>
        <h1 style={styles.title}>Lesson {lessonNumber}</h1>
      </header>

      <ProgressBar
        current={currentExerciseIndex}
        total={totalExercises}
        lessonTitle={lesson?.title || ''}
      />

      <ExerciseCard
        key={currentExercise?.id}
        exercise={currentExercise}
        lessonTitle={lesson?.title || ''}
        onComplete={handleExerciseComplete}
        isLastExercise={isLastExercise}
      />
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    maxWidth: '700px',
    padding: '20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
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
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '60px',
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
    textAlign: 'center',
    padding: '40px',
    color: '#fff',
  }
};
