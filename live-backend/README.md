# live-backend

Railway-hosted teaching backend for the Language Transfer live tutor (PR 1:
real-time voice foundation). Owns the GPT-Live session lifecycle per ADR-001:

- `POST /api/live/session` — accepts the browser's SDP offer, creates the
  Live session server-side with the project API key (`client.live.create` via
  the OpenAI v7 SDK), attaches the sideband, returns `{session, transport.sdp}`.
- `GET /healthz` — liveness probe.
- `POST /api/live/session/:id/close` — graceful close handshake.

The browser never talks to OpenAI and never sees a key. Pedagogical
reasoning, tools, and learner memory land in PRs 2–4; this service is voice
plumbing plus lifecycle management only.

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
