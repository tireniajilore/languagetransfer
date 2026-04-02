import React, { useState } from 'react';
import { LessonSelect } from './components/LessonSelect';
import { ConversationView } from './components/ConversationView';

function App() {
  const [currentLesson, setCurrentLesson] = useState(null);

  const handleSelectLesson = (lessonNumber) => {
    setCurrentLesson(lessonNumber);
  };

  const handleBack = () => {
    setCurrentLesson(null);
  };

  const handleLessonComplete = (lessonNumber) => {
    // Subtle completion - just return to lesson select
    setCurrentLesson(null);
  };

  return (
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        button:hover {
          transform: translateY(-2px);
        }
      `}</style>

      {currentLesson ? (
        <ConversationView
          lessonNumber={currentLesson}
          onComplete={handleLessonComplete}
          onBack={handleBack}
        />
      ) : (
        <LessonSelect onSelectLesson={handleSelectLesson} />
      )}
    </>
  );
}

export default App;
