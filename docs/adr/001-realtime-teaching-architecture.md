# ADR-001: Real-Time Teaching Architecture (GPT-Live)

Date: 2026-10-10. Status: accepted. Author: Finch (lead engineer), from Tireni's brief.

## 1. Context

Tireni's brief asks for a real-time, adaptive AI teacher built on the Language
Transfer "Thinking Method", starting with Spanish, subject-agnostic in design.
The brief names "GPT-Live" as the voice technology. This ADR records the
architecture decisions after verifying the actual platform surface.

### What was verified (2026-10-10)

- **"GPT-Live" is the current OpenAI voice product.** The official docs
  (developers.openai.com, WebRTC guide + Server-side controls guide) describe:
  - Session creation: `POST /v1/live/sessions` with JSON
    `{session: {...}, transport: {type: "webrtc", sdp: <offer>}}`, using the
    **project API key on the server**. SDK: `client.live.create(...)`.
    Voice model: **`gpt-live-1`**.
  - The server exchanges the browser's SDP offer for an answer itself; the
    **browser never talks to OpenAI directly and never sees a key**. There is
    no ephemeral client-token step in the current browser flow.
  - A **sideband WebSocket** (`wss://api.openai.com/v1/live/sessions/{id}/attach`)
    lets the application server observe the same session (transcript deltas,
    delegation events, nested Responses events) and send commands:
    `session.update`, `session.instructions.append` (interrupts speech),
    `session.thinking.append` (quiet context), `session.commentary.append`
    (speakable updates), `response.item.create` + `response.create` (tool
    results), `session.input_audio.mute/unmute`, `session.close`.
  - **Responses delegation**: `session.delegation = {type: "responses",
    responses: {model, instructions, tools, tool_choice,
    parallel_tool_calls, max_output_tokens, reasoning, text}}`.
    When the Live model delegates, the backend model runs the tools; our
    server executes custom functions and returns results via
    `response.item.create` (with the original `call_id`) then `response.create`.
    Duplicate call IDs must not re-execute. Speech continues while delegated
    work runs. Backend model options: `gpt-5.6-terra` (default),
    `gpt-5.6-luna` (cost-sensitive).
  - Session creation bills a 15s voice-duration initialization credit; audio
    travels on WebRTC media tracks; the data channel (`oai-events`) carries
    transcripts/session events only — no audio events on the channel.
- **Existing repo** (tireniajilore/languagetransfer): Next.js 14 app in
  `lt-runner/` (the live product), 88 Spanish lesson JSONs + speech segments
  in `lt-runner/src/data/`, one open unmerged PR (#11, answer classification —
  not to be blindly merged), no test framework, no CI, no Railway config,
  Vercel deploys `lt-runner`. No realtime/WebRTC/websocket code anywhere.
- **Access**: Railway CLI authenticated (projects: trinity-sermons,
  oasis-interviews, innovative-rebirth — nothing for languagetransfer yet);
  Vercel CLI not authenticated; lt-runner deploys through the Vercel dashboard
  GitHub integration.

## 2. Decisions

### D1. Transport: server-mediated WebRTC, one Railway backend

The Railway Node/TypeScript backend owns the Live session lifecycle:
creates sessions with the project API key, performs the SDP exchange with the
browser, and attaches the sideband. The browser does WebRTC + data-channel UI
only. Rationale: this is exactly the officially documented flow; keys stay
server-side; the sideband gives the harness authoritative observation and
steering. Vercel stays as the Next.js UI host — it cannot hold long-lived
sideband sockets.

### D2. One application repo, one backend service to start

Teaching harness, pedagogical tool handlers, session orchestration, and the
new `/live` UI live in this repo. One Railway service for the backend (the
"teaching backend"); split services only on demonstrated need. No
microservices, no orchestration framework unless earned.

### D3. Layer C = Responses delegation + our tool executors

The brief's Layer C (pedagogical reasoning) maps to GPT-Live's
**Responses delegation**: the Live model handles routine exchanges from
preloaded context; when it needs deeper reasoning it delegates, and the
delegated backend model calls our typed tools
(`get_learning_context`, `get_current_objective`, `assess_understanding`,
`get_teaching_options`, `commit_teaching_decision`, `record_learning_evidence`,
`get_learner_history`). Tool execution happens in our backend with validation;
results return through `response.item.create` + `response.create`.

### D4. Latency vs enforcement trade-off (the core tension)

**Hard controls** (enforced in backend code, never left to the model):
current learning objective, available concepts, valid state transitions,
tool permissions, mastery recording, progression decisions, access to
verified curriculum. The Live model may *propose* (via delegation); the
harness *validates and commits* every state change. Idempotency keys
(session_id + turn_id + tool name) prevent double advancement.

**Soft controls** (model instructions + context): teaching tone, question
formulation, guided-discovery preference, no premature answers — delivered
through `session.instructions` at creation and `session.thinking.append`
teaching plans as the lesson advances.

**Guardrails** (evaluated + interruptive): the sideband watches
`session.input_transcript.delta` / `session.output_transcript.delta` with a
fast lightweight checker for answer leakage and unsupported grammatical
claims. On trigger: block the affected tool action and/or send a corrective
`session.instructions.append` (which interrupts speech). This is the
documented server-side pattern.

**Explicitly NOT done in v1**: word-for-word gating of spoken audio
(buffer-and-check before playback). It adds latency and complexity, and the
docs note buffered-speech checks have real pitfalls (withheld speech stays in
context). If offline evals (PR 5) show unacceptable leakage, the documented
fallback is gated playback — this trade-off and its trigger condition are
recorded here so a future engineer can act on it without re-deriving it.

**Fast path / reasoning path** (brief §9): fast path = Live model answers
from preloaded context (target <1s to first audio, measured and reported);
reasoning path = delegation to the backend model only for unfamiliar
misconceptions, failing strategies, direction changes, deep assessment, new
objective planning. Precompute upcoming teaching options and append them as
quiet thinking context.

### D5. Curriculum: reuse, extend, keep subject-agnostic

Reuse the 88 lesson JSONs + segments as the verified Spanish corpus; extend
the data model (objectives, concepts, prerequisites, misconceptions, hints,
progression conditions) as versioned TypeScript types + JSON. The engine
depends on generic concept/objective interfaces; Spanish is the first subject
module. Known gap: lesson 25 is missing from the numbered set.

### D6. Learner memory: Railway Postgres, observations ≠ mastery

New structured store (migrations in repo); record observations and inferred
mastery separately; a correct answer is evidence, not mastery. Async
persistence off the conversational critical path. Existing localStorage
cognates progress stays untouched for the scripted player.

### D7. PR #11: review, don't merge as-is

Reuse its best ideas in PR 3: tri-state deterministic answer scoring before
any model (`answer-match.ts`), classify-not-generate with authored voice
text + leak guard (`/api/correct` pattern), fail-silent-to-script, and its
research docs (32-move taxonomy, move-spec format, measured latency budgets).
Review its tests; the 14/18 diagnosis accuracy needs the flagged follow-up.

### D8. Preserve the scripted player

It remains the fallback and the experimental control. The live tutor is a
separate route (`/live`), sharing curriculum data only.

### D9. CI from zero

New GitHub Actions workflow: typecheck, lint, unit tests, state-machine
tests, tool-contract tests, mocked-model integration tests, pedagogical
regression evals. Leave the TikTok cron workflow alone.

## 3. Consequences

- The backend needs an **OpenAI project API key with GPT-Live access** —
  Tireni to provide (see "needs his attention" below).
- Usage costs: Live voice duration + delegation model calls. Staging
  deployments are fine; persistent production spend needs his sign-off.
- `session.instructions.append` corrective steering is the enforcement
  backstop for spoken content in v1; its effectiveness is an *evaluated*
  control, reported honestly in PR 5.

## 4. Needs Tireni's attention

1. **OpenAI project key with GPT-Live access** — how does he want to supply
   it (Railway dashboard paste or chat paste, then rotate)? Nothing works
   without it.
2. **Railway project/service for languagetransfer** — create under his
   existing account; confirm he's fine with the usage cost.
3. **Merge policy** — no merges to `main` without his explicit approval (per
   his brief); PRs will be opened for review.
4. Vercel CLI is not authenticated — new preview URLs for the `/live` route
   will come through the existing GitHub→Vercel integration unless he wants
   CLI access set up.
