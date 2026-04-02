import { useState, useEffect, useCallback } from 'react';
import { getLesson, getProgress, updateProgress } from '../api/tutor';

/**
 * Hook for managing lesson state
 */
export function useLesson(lessonNumber) {
  const [lesson, setLesson] = useState(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load lesson data
  useEffect(() => {
    async function loadLesson() {
      try {
        setLoading(true);
        setError(null);

        const [lessonData, progressData] = await Promise.all([
          getLesson(lessonNumber),
          getProgress('default')
        ]);

        setLesson(lessonData);

        // Resume from saved position if same lesson
        if (progressData.current_lesson === lessonNumber) {
          setCurrentExerciseIndex(progressData.current_exercise_index || 0);
        } else {
          setCurrentExerciseIndex(0);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadLesson();
  }, [lessonNumber]);

  const currentExercise = lesson?.exercises?.[currentExerciseIndex] || null;
  const totalExercises = lesson?.exercises?.length || 0;
  const isLastExercise = currentExerciseIndex >= totalExercises - 1;

  const nextExercise = useCallback(() => {
    if (!isLastExercise) {
      setCurrentExerciseIndex(prev => prev + 1);
    }
  }, [isLastExercise]);

  const previousExercise = useCallback(() => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(prev => prev - 1);
    }
  }, [currentExerciseIndex]);

  const recordAttempt = useCallback(async (isCorrect, attempts) => {
    try {
      await updateProgress('default', lessonNumber, currentExerciseIndex, isCorrect, attempts);
    } catch (err) {
      console.error('Failed to record progress:', err);
    }
  }, [lessonNumber, currentExerciseIndex]);

  return {
    lesson,
    currentExercise,
    currentExerciseIndex,
    totalExercises,
    isLastExercise,
    loading,
    error,
    nextExercise,
    previousExercise,
    recordAttempt
  };
}
