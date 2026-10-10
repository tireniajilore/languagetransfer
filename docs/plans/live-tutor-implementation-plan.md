# Live Tutor Implementation Plan

Derived from Tireni's brief + ADR-001. Ordered; each phase ends in a reviewable PR.
No merges to `main` without his approval.

## Phase 0 — Foundations (done 2026-10-10)
- Repo inventory complete; PR #11 reviewed (reuse, don't merge as-is).
- GPT-Live surface verified against official docs (see ADR-001 §1).
- Railway access confirmed; Vercel CLI not authenticated.
- **Blocker for anything live**: OpenAI project key with GPT-Live access (his call on delivery method).

## PR 1 — Real-time voice foundation
**Goal**: a learner can hold a natural, interruptible Spanish voice conversation
backed by our server.

- Railway Node/TS backend: `POST /api/live/session` (accepts SDP offer,
  `client.live.create({session, transport})`, returns `{session, transport.sdp}`);
  sideband attach per session (`wss://.../sessions/{id}/attach`); lifecycle
  (`session.started` → ready, `session.close`/`session.closed`, reconnect).
- Browser `/live` route in lt-runner: mic capture, RTCPeerConnection,
  `oai-events` data channel, audio playback, transcript display, interrupt
  handling, connection recovery, graceful close with final usage.
- Security: key server-side only; origin checks; rate limits on session mint.
- Tests: session-creation contract (mocked OpenAI), sideband attach/reconnect
  state machine, WebRTC client unit tests with mocked RTCPeerConnection,
  latency instrumentation (speech-end → first audio).
- **Acceptance**: natural uninterrupted Spanish conversation through our
  backend session; interruption works; recovery works.

## PR 2 — Teaching harness (Layer B)
**Goal**: objective-based teaching state, harness-owned progression.

- Pure-TS state machine: objectives, concepts, valid transitions, teaching
  moves (the 12 `TeachingMove`s from the brief), permission + transition
  validation.
- Tool schemas + router: `get_learning_context`, `get_current_objective`,
  `assess_understanding`, `get_teaching_options`, `commit_teaching_decision`,
  `record_learning_evidence`, `get_learner_history` — validated, idempotent
  (session+turn keys), read/write separated, all decisions logged.
- Context assembly: current objective + precomputed options appended as
  `session.thinking` (fast path); Live instructions encode soft controls.
- Curriculum extension: objective/concept/prerequisite/misconception/hint
  model over existing lesson JSONs; subject-agnostic engine, Spanish module.
- Tests: state-machine property tests, tool contract tests, invalid-transition
  rejection, duplicate-event idempotency.
- **Acceptance**: system selects and validates teaching moves without replaying
  the script; harness rejects invalid progression.

## PR 3 — Adaptive reasoning (Layer C)
**Goal**: different learner behaviors → pedagogically different lessons.

- Responses delegation wired: `delegation.responses` with pedagogical
  instructions + tools; backend model (gpt-5.6-terra default, luna option).
- Response analysis: tri-state scoring first (reuse PR #11 `answer-match.ts`
  logic), then delegation for unfamiliar misconceptions; dynamic hints;
  transfer-question generation; fast/slow paths per ADR-001 D4.
- Reuse PR #11: authored diagnoses + leak guard + fail-silent pattern.
- Guardrails on sideband transcript deltas: answer-leak + unsupported-claim
  checks, corrective `session.instructions.append` on trigger.
- Tests + teaching-scenario evals: the brief's 15 automated cases and the
  pedagogical dataset (simulated learners on real Spanish material).
- **Acceptance**: scripted learner personas (correct-with-reasoning,
  correct-without, misconception, struggling, interrupting, mastered) produce
  meaningfully different teaching behavior.

## PR 4 — Persistent learner memory (Layer D)
**Goal**: prior evidence shapes later teaching.

- Railway Postgres + migrations; schema: learners, sessions, turns, evidence
  (observations), concept states (inferred mastery separate from evidence),
  misconceptions, interventions + outcomes, retention.
- Session restore; cross-session personalization in context assembly;
  async persistence; retention/privacy controls.
- Tests: memory influence tests (same learner, different history → different
  plan), restore correctness, no double-counting.
- **Acceptance**: a returning learner resumes with history reflected in
  teaching decisions.

## PR 5 — Production readiness + evaluation
**Goal**: deployed, observable, honest about limits.

- Observability: latency dashboards (speech-end→audio, delegation, tool
  exec), teaching-policy violation metrics, session health.
- Latency benchmarks vs the <1s target; failure recovery; staging→prod
  verification; feature flag for the `/live` route; rollback plan.
- Automated evaluation reports; documented limitations; comparison harness
  vs scripted player (the A/B control from the brief §11).
- Docs: operator runbook, architecture summary for the next engineer.
- **Acceptance**: system deployed and observable; limitations documented;
  nothing claimed without a verified measurement.

## Out of scope (explicit)
- Curriculum generation pipeline; other subjects (Yoruba/Marathi later);
  phone/SIP; merging to main; production spend — all need his explicit call.

## Current status
Phase 0 done. PR 1 implementation complete on branch
`feat/live-tutor-foundation` — draft PR #14 opened 2026-10-10
("PR 1: real-time voice foundation (GPT-Live)"): live-backend service
(session mint + sideband lifecycle), /live WebRTC route, 56 hermetic tests
green, `next build` verified. NOT merged (needs his approval per §12).
PR 2 (teaching harness, Layer B) implemented 2026-10-10 on the same branch:
objective-based state machine, 12 validated teaching moves, 7 typed tools
with idempotent router, Spanish v1 curriculum, context assembly, sideband
observer; 129 hermetic tests green, typecheck + lint clean. Draft PR to be
opened as "PR 2: teaching harness (Layer B)".
Next: unblock the OpenAI key (standing blocker), then staging deploy +
live end-to-end verification (real voice session, measured latency).
