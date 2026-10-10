# Live Tutor Architecture

The real-time adaptive AI teacher (Tireni's brief, ADR-001). Five logical
layers, one repo, one backend service to start.

## The five layers

**Layer A — Real-time voice (GPT-Live).** The browser does WebRTC only: mic
capture → `RTCPeerConnection`, `oai-events` data channel for transcripts and
session events, remote-audio playback. It POSTs its SDP offer to *our*
backend and applies the returned answer. It never talks to OpenAI and never
sees a key. Interruptions and turn-taking are native to the Live model.

**Layer B — Teaching harness (deterministic, authoritative).** Pure
TypeScript state machine in `live-backend/src/harness/` + `src/curriculum/`:
objectives, concepts, prerequisites, the 12 `TeachingMove`s, transition
validation. Seven typed tools (`get_learning_context`,
`get_current_objective`, `assess_understanding`, `get_teaching_options`,
`commit_teaching_decision`, `record_learning_evidence`,
`get_learner_history`) with zod schemas, read/write separation, and
idempotency keys (session + tool + turn + payload hash) — a repeated call
can never advance the learner twice. The Live model may *propose* moves via
delegation; only the harness *commits* them, and every commit is validated
first. Context assembly precomputes the fast-path teaching context
(rendered for `session.thinking`).

**Layer C — Pedagogical reasoning (delegated).** GPT-Live's Responses
delegation: when the voice model needs deeper reasoning it delegates, and
the backend model (default `gpt-5.6-terra`, `gpt-5.6-luna` as cost option)
calls our tools. Our `DelegationManager` executes them through the
`ToolRouter` (validation + idempotency already enforced) and returns results
via `response.item.create` + `response.create`. Response analysis runs a
deterministic tri-state scorer *first* (right/wrong/unclear); only unfamiliar
cases take the reasoning path. Guardrails watch the transcript stream for
answer leakage and teaching-ahead, with interruptive corrective steering.

**Layer D — Learner memory (Postgres, optional).** `live-backend/src/memory/`:
learners, sessions, evidence (observations), concept states (inferred mastery
kept separate from evidence), misconceptions, interventions. Write-behind
queue with backoff; observations ≠ mastery — a correct answer is evidence,
not mastery (mastery needs repeated correct + a transfer pass + no open
misconceptions). Without `DATABASE_URL` the backend runs on the in-memory
store and nothing persists.

**Layer E — Curriculum and knowledge.** `src/curriculum/`: subject-agnostic
Concept/Objective/Misconception/Hint interfaces with `validateCurriculum()`
(reference integrity, prerequisite acyclicity). Spanish v1 covers the first
substantive concepts of lessons 02–04 (cognate patterns, `quiero` +
infinitive) with authored misconceptions and escalating hints. The engine
depends on the generic interfaces; Spanish is the first subject module.

## Data flow: one learner turn

```
browser mic → WebRTC → OpenAI GPT-Live (gpt-live-1)
    │
    ├─ audio: spoken reply straight back to the browser (fast path)
    │
    └─ data channel → sideband → our backend observes:
         1. transcript delta → GuardrailMonitor (answer_leak? teaching_ahead?)
         2. turn complete → HarnessObserver.record (neutral utterance observation)
         3. analyzeResponse: tri-state match
              ├─ right/wrong with known pattern → fast path: precomputed
              │   teaching options already in session.thinking; Live model speaks
              └─ unfamiliar → delegation.created → backend model reasons,
                  calls tools (ToolRouter validates + commits) →
                  response.item.create + response.create → Live model speaks
         4. commit_teaching_decision → state machine validates → turn advances
         5. evidence → write-behind → Postgres (if configured)
```

Latency budget (brief §9): the fast path must stay <1s speech-end → first
audio. Backend-owned slices (analysis, tool dispatch, delegation overhead)
are sub-millisecond by construction (see `npm run bench`); the dominant
terms are model inference + network, measured live per
`docs/plans/live-latency-procedure.md`.

## Enforcement: what is truly enforced vs merely prompted

| control | mechanism | examples |
|---|---|---|
| **Hard** (code, never the model) | state machine, tool schemas, idempotency, permission checks | current objective, available concepts, valid transitions, prerequisite locking, no premature reveals, evidence-gated advancement, mastery recording, tool permissions, verified-curriculum access |
| **Soft** (instructions + context) | `session.instructions` at mint, `session.thinking.append` teaching plans | teaching tone, question formulation, guided-discovery preference, pacing, encouragement |
| **Evaluated** (measured, interruptive) | sideband guardrails + eval suites | answer-leak / teaching-ahead detection with corrective `session.instructions.append`; `docs/evals/latest.md` tracks pass rates |

Explicitly NOT done: word-for-word pre-playback gating of spoken audio
(ADR-001 D4 — latency cost, and withheld speech stays in model context).
Revisit only if evals show unacceptable leakage.

## Failure domains (see runbook for operations)

- **Sideband drop**: reconnect with backoff (5 attempts); then the session is
  abandoned server-side. Voice may continue briefly, unobserved.
- **Backend restart**: in-memory registry, sidebands, delegations, and
  unflushed evidence are lost. Postgres keeps flushed learner data; the next
  session restores concept knowledge but not the in-progress turn.
- **OpenAI 429/5xx**: backend returns 502 with `retryable`; the browser backs
  off (3 attempts). Non-retryable failures (400, 403, rejected key,
  kill-switch) fail fast with no retries.
- **Duplicate delivery**: idempotency keys on write tools; duplicate
  delegation call IDs never re-execute; close is idempotent.
- **Kill-switches**: `LIVE_TUTOR_ENABLED=0` (backend, 503 on mint),
  `NEXT_PUBLIC_LIVE_TUTOR_ENABLED` (frontend route gate, default off),
  `LIVE_DELEGATION_DISABLED=1` (voice without deep reasoning).
