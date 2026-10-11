-- Legacy cursors advanced on authorization; they cannot be promoted to verified progress.
CREATE TABLE teaching_checkpoints (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  lesson_number INTEGER NOT NULL,
  lesson_version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  checkpoint JSONB NOT NULL,
  owner_session_id TEXT,
  lease_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, lesson_number)
);
