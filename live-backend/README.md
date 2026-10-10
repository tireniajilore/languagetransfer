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
(delegation) and persistent learner memory land in PRs 3–4.

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

Config-only: `Dockerfile` + `railway.json` in this directory. Do NOT create
the Railway project/service or set production env vars without Tireni's
explicit approval (per the brief §13).

**Known blocker (2026-10-10):** staging deploy is blocked on an OpenAI
project API key with GPT-Live access. Nothing live can be verified until it
is provisioned.
