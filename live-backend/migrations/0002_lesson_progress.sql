-- Lesson-specific progress is distinct from concept mastery.
-- An incomplete lesson never unlocks the next lesson.
CREATE TABLE lesson_progress (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  lesson_number INTEGER NOT NULL CHECK (lesson_number BETWEEN 2 AND 90),
  step_index INTEGER NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  phase TEXT NOT NULL DEFAULT 'ready' CHECK (phase IN ('ready', 'awaiting_answer', 'completed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, lesson_number)
);
CREATE INDEX lesson_progress_updated_idx ON lesson_progress(updated_at);
