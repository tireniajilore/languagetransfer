# live-backend

Railway-hosted teaching backend for the Language Transfer live tutor. Owns the
GPT-Live session lifecycle per ADR-001, plus the Layer B teaching harness
(PR 2: objective-based state machine, validated teaching moves, tool router).

- `POST /api/live/session` — accepts the browser's SDP offer (plus optional
  `learnerId` / `objectiveId`), creates the Live session server-side with the
  project API key (`client.live.create` via the OpenAI v7 SDK), attaches the
  sideband, initializes harness state, returns `{session, transport.sdp}`.
- `GET /healthz` — liveness probe.
- `POST /api/live/session/:id/close` — graceful close handshake (also abandons
  the harness state for the session).
- `POST /api/live/session/:id/tools` — dispatch a harness tool call
  (`{tool, input, idempotencyKey?}`); error codes map to HTTP status
  (400 invalid input/unknown tool, 404 unknown session, 409 stale
  turn/invalid move/inactive session).
- `GET /api/live/session/:id/context` — read the assembled teaching context.

The browser never talks to OpenAI and never sees a key. Pedagogical reasoning
(delegation) landed in PR 3; persistent learner memory (below) landed in PR 4.

## Teaching harness (Layer B)

Pure-TypeScript, framework-free, in `src/harness/` + `src/curriculum/`:

- `src/curriculum/types.ts` — subject-agnostic data model (concepts,
  objectives, prerequisites, misconceptions, approved hints, progression
  conditions) with `validateCurriculum()`.
- `src/curriculum/spanish.ts` — Spanish v1: first substantive concepts of
  lessons 02–04 (cognate patterns, `quiero + infinitive`).
- `src/harness/stateMachine.ts` — the authoritative state machine:
  `createHarnessState`, `validateMove`, `applyMove`, `recordEvidence`,
  `getTeachingOptions`, session lifecycle. Hard controls enforced here:
  prerequisite locking, escalating hints, verified counterexamples only,
  unfamiliar transfer examples, no premature answer reveals, evidence-gated
  objective advancement, registered misconceptions only.
- `src/harness/tools.ts` — the seven typed tools
  (`get_learning_context`, `get_current_objective`, `assess_understanding`,
  `get_teaching_options`, `commit_teaching_decision`,
  `record_learning_evidence`, `get_learner_history`) with zod schemas,
  read/write separation, idempotency keys, and structured JSON logging.
- `src/harness/context.ts` — pure context assembly for the fast-path
  preloaded teaching context (rendered text targets `session.thinking` in PR 3).
- `src/harness/observer.ts` — deterministic sideband transcript feed:
  completed speaker turns become neutral `utterance` observations (no
  inference; deep reasoning is PR 3).

Mastery rule (conservative): a concept becomes `mastered` only with enough
correct evidence **plus** a transfer pass and no open misconceptions — a
single correct answer never implies mastery. Observations and inferred
mastery are stored separately.

## Learner memory (Layer D)

Optional Postgres persistence for cross-session learning, in `src/memory/`.
Without `DATABASE_URL` the backend runs exactly as before: the in-memory
harness store, nothing persisted.

- `migrations/0001_initial_schema.sql` — version-controlled schema; applied
  in order at startup by `src/memory/migrate.ts` (`npm run migrate`),
  recorded in `schema_migrations`. Tables: `learners`, `sessions`,
  `utterances`, `evidence` (observations — never inferred), `concept_states`
  (inferred mastery, separate from evidence), `learner_concepts`,
  `misconceptions`, `interventions` + outcomes, `retention_snapshots`.
- `src/memory/pgStore.ts` — `PersistentHarnessStore extends HarnessStore`:
  reads stay synchronous and in-memory (the conversational hot path never
  waits on the DB); mutations apply to memory first, then persist through a
  write-behind queue (timer + explicit `flush()` on session close and
  shutdown). All writes are idempotent upserts / `ON CONFLICT DO NOTHING`,
  so a failed flush can retry without double-counting.
- `src/memory/mastery.ts` — learner-level mastery is **derived**, not
  stored: all evidence for a concept replays through the state machine's own
  conservative rule (`src/memory/mastery.ts:deriveConcept`), with the
  derivation inputs stored alongside the estimate so it is auditable.
- Session restoration: minting with a known `learnerId` loads prior concept
  states into the new session — mastered concepts stay mastered (their
  introductions are skipped), open misconceptions carry over and unlock
  their dependents. `get_learner_history` gains a `crossSession` summary.

**What is stored, and why.** Learner ids, session metadata, transcript text
(`utterances`), evidence records (correct/incorrect/transfer/flags),
per-session concept states, interventions, and derived learner-level
aggregates. These exist so the tutor remembers what the learner has
demonstrated — nothing else.

**What is never stored.** No audio, ever — only transcript text. No
credentials, no payment data.

**Retention.** `MEMORY_RETENTION_DAYS` (default 180): raw session data
(sessions, utterances, evidence, interventions) for sessions that ended
before the window is purged by `purgeExpired` (runs at startup). Derived
learner-level aggregates (`learner_concepts`, `retention_snapshots`, open
misconceptions) are kept — they are summaries, not raw observations.

Config: `DATABASE_URL` (unset = memory-only), `MEMORY_RETENTION_DAYS`,
`MEMORY_FLUSH_INTERVAL_MS`. See `.env.example`.

## Run locally

```bash
cp .env.example .env   # then fill OPENAI_API_KEY
npm install
npm run dev
```

## Test

```bash
npm run typecheck && npm run lint && npm test
```

All tests are hermetic (mocked OpenAI SDK + WebSocket); no key required.

## Deployment (Railway)

Staging: Railway project `languagetransfer`, service `live-backend`
(`https://live-backend-production-bfc0.up.railway.app`). Deploy from this
directory (it's linked to the project):

```bash
railway up -d -s live-backend
```

`OPENAI_API_KEY` is set as a service variable (never commit it). Full env
reference: `.env.example`. Operational guide: `docs/runbook.md`
(incidents, key rotation, rollback order).

## Observability

- `GET /metrics` — JSON summary: latency p50/p95/max per label
  (`live.session.create_ms`, `tools.exec_ms`, `delegation.roundtrip_ms`),
  counters (`sessions.created/closed/errored`,
  `delegation.created/completed/failed`, `guardrail.triggered` by kind,
  `teaching.move` distribution), active sessions, uptime. No PII.
- Logs (stdout): `[live] …` for session lifecycle (every line carries the
  session id), `[memory] …` for the write-behind queue, and one JSON line
  per tool dispatch (`{"component":"harness-tools", sessionId, tool,
  turnId, ok, errorCode, durationMs}`). Full vocabulary: `docs/runbook.md`.
- Scripted latency benchmark (mocked boundaries, no OpenAI):
  `npm run bench`. Real speech-end → first-audio must be measured live —
  see `docs/plans/live-latency-procedure.md` (target <1s, brief §9).
