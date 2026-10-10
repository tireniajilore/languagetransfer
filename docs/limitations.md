# Limitations

What the live tutor does **not** do yet, stated plainly. Each item names the
condition under which it stops being true.

## Not verified live

- **No real voice session has ever run.** Every test is hermetic with mocked
  OpenAI/WebRTC boundaries. The session-mint path was verified against the
  real API (bogus SDP → clean error mapping), but no human has spoken to the
  tutor, and no real latency number exists. Stops being true after
  `docs/plans/live-latency-procedure.md` is executed against staging.
- **Real speech-end → first-audio is unmeasured.** The <1s brief target is
  aspirational until the procedure above produces numbers. Backend-owned
  slices are sub-millisecond (`npm run bench`); the model + network dominate.

## State and persistence

- **A backend restart orphans active sessions.** The session registry,
  sideband sockets, delegation managers, and unflushed write-behind evidence
  (up to `MEMORY_FLUSH_INTERVAL_MS`, default 5s) are in-memory. Postgres
  keeps everything flushed, so the *learner's concept knowledge* is restored
  on the next session — but the in-progress turn, the voice call, and any
  mid-turn reasoning are gone. There is no session resume across restarts;
  the restore path is per-learner, not per-session.
- **Without `DATABASE_URL`, nothing persists.** The backend runs fine on the
  in-memory store, but all learner memory evaporates on restart or redeploy.

## Teaching scope

- **Spanish only, and only the beginning of it.** Curriculum v1 covers the
  first substantive concepts of lessons 02–04. The engine is subject-agnostic
  by design (ADR-001 D5), but no second subject exists.
- **Lesson 25 is missing** from the numbered lesson set (a gap in the source
  material, predating this project). The curriculum model works around it;
  the gap is not filled.
- **Evals use simulated learners, not real ones.** The 35/35 eval pass rate
  (see `docs/evals/latest.md`) measures the harness against scripted
  personas. Emergent real-learner behavior — confusion the personas don't
  model, accents, code-switching, disengagement — is unmeasured. The A/B
  comparison design (`docs/plans/ab-comparison.md`) is the path to real
  evidence.

## Enforcement

- **Spoken content is not gated word-for-word.** Guardrails detect answer
  leakage and teaching-ahead on the transcript stream and steer
  interruptively, but a determined model utterance reaches the learner's ears
  before any check runs. This is the documented ADR-001 D4 trade-off:
  pre-playback gating was rejected for v1 on latency grounds, with evals as
  the trigger to revisit. The current evals do not measure leakage *rates*
  in open conversation — only the deterministic checks fire or don't.
- **The voice model can still be wrong about Spanish.** Guardrails catch
  *curriculum* violations (untaught concepts, premature answers), not
  *factual* errors in what the model says about taught material. Factual
  verification of the model's Spanish is an open eval gap.

## Operations

- **One backend instance.** Rate limiting and the idempotency cache are
  in-memory; a second instance would double-count. Don't scale horizontally
  without externalizing them.
- **`/metrics` is unauthenticated.** Fine on the trusted service network;
  don't expose it publicly without auth.
- **`ALLOWED_ORIGIN` defaults to allow-all.** Until it's set to the real
  frontend origin, anyone can mint sessions and burn voice-duration credits
  (rate-limited to 10/min/IP by default).
