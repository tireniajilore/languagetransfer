# Live Latency Measurement Procedure

**Goal:** measure real speech-end → first-audio latency for the live tutor
against staging, to validate the brief §9 target of **<1s to first audio for
routine responses**.

The scripted benchmark (`npm run bench` in `live-backend/`) only covers the
backend-owned slice (analysis, tool dispatch, delegation overhead — all
sub-millisecond). The dominant terms — Live model inference, network, browser
audio pipeline — can only be measured with a real voice session. This
procedure is designed to be run by a human with a microphone and a browser.

## Prerequisites

- `live-backend` deployed to Railway staging with a valid `OPENAI_API_KEY`
  (GPT-Live access). Confirm `GET /healthz` → 200.
- The `/live` route deployed (Vercel) with `NEXT_PUBLIC_LIVE_BACKEND_URL`
  pointing at the backend and `NEXT_PUBLIC_LIVE_TUTOR_ENABLED=1`.
- Chrome or Edge (WebRTC + `performance.now()` resolution), a quiet room, a
  microphone.

## Method A — browser console timestamps (recommended)

1. Open the `/live` page, open DevTools → Console.
2. Start a session. In the console, the `LiveVoiceSession` class logs
   connection milestones; note the `session.started` time as T0.
3. Speak a fixed probe phrase clearly, then stop speaking:
   - Routine (fast path): *"¿Cómo se dice 'I want'?"* — the model should
     answer from preloaded context without delegating.
   - Reasoning path: *"Why is it 'quiero cancelar' and not 'quiero a cancelar'?"*
     — expect delegation; this will be slower by design.
4. In DevTools → Network, or via the transcript panel timestamps, record:
   - **T_speech_end**: the time the `input_audio_buffer.speech_stopped` event
     (or the final user transcript delta) arrives on the `oai-events` data
     channel. In the console: `performance.now()` at that log line.
   - **T_first_audio**: the time the first remote-audio track data plays
     (the `track` event on the peer connection, or the first non-silent
     sample in the audio element). Approximate via the assistant-speaking
     indicator flipping on, logged with `performance.now()`.
   - **Latency = T_first_audio − T_speech_end.**
5. Repeat 10× per probe type, alternating, with ~10s gaps (avoid rate limits
   and model warm-up effects polluting the first sample — discard sample 1).
6. Record in the table below.

## Method B — backend /metrics cross-check

After the session, `GET /metrics` on the backend and note:
- `live.session.create_ms` (p50/p95) — session mint cost, paid once per session.
- `delegation.roundtrip_ms` — how long delegated reasoning took (reasoning-path
  samples only).
- `tools.exec_ms` — should stay sub-millisecond; if not, something regressed.

These do not include model inference or network; they bound the backend slice.

## Results table

| date | probe | n | p50 | p95 | max | notes |
|------|-------|---|-----|-----|-----|-------|
|      | routine (fast path) |   |     |     |     | target <1000ms |
|      | reasoning (delegation) |   |     |     |     | no hard target; report |

## Interpreting results

- **Routine p95 < 1s**: target met. Ship it.
- **Routine p95 1–2s**: acceptable for v1, but try: shorter `session.instructions`
  (less preamble per turn), precomputed teaching options via
  `session.thinking.append` (already in the harness — verify it's populated),
  and confirm no delegation is firing on the fast path (`delegation.created`
  counter in /metrics should stay 0 for routine probes).
- **Routine p95 > 2s**: investigate before calling it done — check
  `delegation.roundtrip_ms` (is the model delegating when it shouldn't?),
  network path (WARP per the OpenAI docs reduces handshake latency), and
  model choice (`gpt-live-1` vs newer snapshots).
- **Reasoning path**: inherently slower (extra model round-trip). The
  trade-off is deliberate (ADR-001 D4): correctness over speed. Report the
  numbers; do not "fix" by disabling delegation.

## What this does NOT measure

- First-session cold start (mic permission, ICE gathering, SDP exchange) —
  measure separately if onboarding feels slow.
- Perceived latency under interruption (barge-in) — qualitative; note it.
- Anything about teaching quality — that's the eval report
  (`docs/evals/latest.md`), not this procedure.
