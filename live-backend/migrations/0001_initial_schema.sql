-- 0001_initial_schema: persistent learner memory (Layer D).
--
-- Design notes (ADR-001 D6):
--  * `evidence` stores OBSERVATIONS only — what happened, never what it means.
--  * `learner_concepts` stores INFERRED mastery, derived from evidence by the
--    conservative rule (>= minCorrectEvidence correct + transfer pass when
--    required + no open misconceptions). The `derivation` JSONB column records
--    the exact inputs so every estimate is auditable.
--  * No audio is ever stored. `utterances` holds transcript text only.
--  * Raw session data (sessions/utterances/evidence/concept_states/
--    interventions) is purged after MEMORY_RETENTION_DAYS; the derived
--    learner-level aggregates (learner_concepts, retention_snapshots, open
--    misconceptions) are kept.

CREATE TABLE learners (
  id TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  learner_id TEXT REFERENCES learners (id) ON DELETE SET NULL,
  curriculum_version TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  status TEXT NOT NULL,
  turn INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS sessions_learner_idx ON sessions (learner_id, started_at DESC);

-- Transcript archive (text only, never audio). speaker is user|assistant.
CREATE TABLE utterances (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  learner_id TEXT REFERENCES learners (id) ON DELETE SET NULL,
  turn_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  speaker TEXT NOT NULL CHECK (speaker IN ('user', 'assistant')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);
CREATE INDEX IF NOT EXISTS utterances_session_idx ON utterances (session_id, seq);

-- Observations. dedupe_key mirrors the harness evidenceKey()
-- (turnId:kind:conceptId:misconceptionId:seq), namespaced by session, so a
-- retried or redelivered observation can never double-count.
CREATE TABLE evidence (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  learner_id TEXT REFERENCES learners (id) ON DELETE SET NULL,
  turn_id INTEGER NOT NULL,
  seq INTEGER,
  concept_id TEXT,
  kind TEXT NOT NULL,
  detail TEXT,
  misconception_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS evidence_session_idx ON evidence (session_id, id);
CREATE INDEX IF NOT EXISTS evidence_learner_concept_idx ON evidence (learner_id, concept_id);

-- Per-session concept states as computed by the harness state machine.
CREATE TABLE concept_states (
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL,
  status TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  transfer_pass_count INTEGER NOT NULL DEFAULT 0,
  hints_used TEXT[] NOT NULL DEFAULT '{}',
  open_misconceptions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, concept_id)
);

-- Learner-level inferred mastery, derived from ALL of the learner's evidence
-- across sessions by replaying it through the harness state machine.
-- derivation = { rule, minCorrectEvidence, requireTransferPass, correctCount,
--   transferPassCount, openMisconceptions, evidenceIds }.
CREATE TABLE learner_concepts (
  learner_id TEXT NOT NULL REFERENCES learners (id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL,
  status TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  transfer_pass_count INTEGER NOT NULL DEFAULT 0,
  open_misconceptions TEXT[] NOT NULL DEFAULT '{}',
  derivation JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, concept_id)
);

-- Flagged misconceptions per learner. One row per (learner, concept,
-- misconception); a later correct/transfer_pass flips it to resolved.
CREATE TABLE misconceptions (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners (id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions (id) ON DELETE SET NULL,
  concept_id TEXT NOT NULL,
  misconception_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (learner_id, concept_id, misconception_id)
);
CREATE INDEX IF NOT EXISTS misconceptions_learner_idx ON misconceptions (learner_id, status);

-- Committed teaching decisions and their observed outcomes.
CREATE TABLE interventions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  learner_id TEXT REFERENCES learners (id) ON DELETE SET NULL,
  turn_id INTEGER NOT NULL,
  decision_id TEXT NOT NULL,
  move TEXT NOT NULL,
  move_detail JSONB NOT NULL DEFAULT '{}',
  rationale TEXT,
  outcome TEXT,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, decision_id)
);
CREATE INDEX IF NOT EXISTS interventions_session_idx ON interventions (session_id, turn_id);

-- Point-in-time learner snapshots for retention-over-time analysis.
-- Written at session close; never purged by the retention job.
CREATE TABLE retention_snapshots (
  id BIGSERIAL PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners (id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL,
  status TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  transfer_pass_count INTEGER NOT NULL DEFAULT 0,
  open_misconceptions TEXT[] NOT NULL DEFAULT '{}',
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retention_learner_idx
  ON retention_snapshots (learner_id, concept_id, taken_at DESC);
