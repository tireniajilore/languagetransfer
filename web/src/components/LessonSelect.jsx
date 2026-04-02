import React, { useState, useEffect } from 'react';
import { getConversationLessons } from '../api/tutor';

export function LessonSelect({ onSelectLesson }) {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchLessons() {
      try {
        const data = await getConversationLessons();
        setLessons(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLessons();
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading lessons...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>Failed to load lessons: {error}</p>
          <p style={styles.hint}>Make sure the backend server is running on port 8000</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🎓 Voice AI Spanish Tutor</h1>
        <p style={styles.subtitle}>Learn Spanish using the Language Transfer method</p>
      </header>

      <div style={styles.lessonGrid}>
        {lessons.map((lesson) => (
          <button
            key={lesson.lesson_number}
            onClick={() => onSelectLesson(lesson.lesson_number)}
            style={styles.lessonCard}
          >
            <span style={styles.lessonNumber}>Lesson {lesson.lesson_number}</span>
            <span style={styles.lessonTitle}>{lesson.title}</span>
            <span style={styles.lessonDescription}>{lesson.description}</span>
            <span style={styles.exerciseCount}>
              {lesson.turn_count} turns
            </span>
          </button>
        ))}
      </div>

      <footer style={styles.footer}>
        <p>Based on Language Transfer's Complete Spanish course</p>
      </footer>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    maxWidth: '800px',
    padding: '20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
    color: '#fff',
  },
  title: {
    fontSize: '36px',
    fontWeight: '700',
    margin: '0 0 12px 0',
  },
  subtitle: {
    fontSize: '18px',
    opacity: 0.9,
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#fff',
    fontSize: '18px',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '16px',
    color: '#333',
  },
  hint: {
    fontSize: '14px',
    color: '#666',
  },
  lessonGrid: {
    display: 'grid',
    gap: '16px',
  },
  lessonCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: 'none',
    borderRadius: '16px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
  },
  lessonNumber: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#667eea',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  lessonTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#333',
  },
  lessonDescription: {
    fontSize: '14px',
    color: '#666',
    lineHeight: 1.4,
  },
  exerciseCount: {
    fontSize: '13px',
    color: '#888',
    marginTop: '4px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '40px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '14px',
  }
};
