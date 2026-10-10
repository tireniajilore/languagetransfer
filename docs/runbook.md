# Live Tutor Runbook

Operational guide for the `live-backend` service (Railway) and the `/live`
frontend route (Vercel). For the architecture, see `docs/architecture.md`;
for known gaps, `docs/limitations.md`.

## Services

| piece | where | what |
|---|---|---|
| `live-backend` | Railway project `languagetransfer`, service `live-backend` | GPT-Live session mint, sideband, teaching harness, delegation, memory |
| `/live` route | Vercel, `lt-runner` app | browser WebRTC client (no OpenAI contact) |
| Postgres | Railway, same project (PR 4) | learner memory; optional — backend runs in-memory without it |

Production backend URL (staging): `https://live-backend-production-bfc0.up.railway.app`

## Deploy

From `live-backend/` (the directory is linked to the Railway project):

```bash
railway up -d -s live-backend
```

The service builds from `Dockerfile` (`npm ci`, `npm run build`, `node dist/index.js`).
`GET /healthz` must return 200 afterwards. To roll back, redeploy a previous
deployment from the Railway dashboard (Deployments → ⋯ → Redeploy), or
`railway down -s live-backend` to remove the latest deployment.

**Stack rollback order** (if a PR in the stack must come out): revert in
reverse — PR 5 → PR 4 → PR 3 → PR 2 → PR 1. Each PR is on its own branch
(`feat/live-tutor-pr2` … `feat/live-tutor-pr5` stacked); `git revert` the
merge or reset the branch, then redeploy. The scripted lesson player is
untouched by all five PRs, so the fallback product keeps working regardless.

## Environment variables

Set in Railway → service → Variables (never commit values). Full list with
defaults in `live-backend/.env.example`. The ones that matter operationally:

| var | required | effect |
|---|---|---|
| `OPENAI_API_KEY` | yes | OpenAI **project** key with GPT-Live access. Used for session mint + sideband. |
| `ALLOWED_ORIGIN` | no | Comma-separated origins allowed to mint sessions. **Set this to the Vercel URL in production** — empty means allow-all (rate-limited, but anyone can burn voice credits). |
| `LIVE_TUTOR_ENABLED` | no | `0` → `POST /api/live/session` returns 503. Kill-switch; default enabled. |
| `LIVE_DELEGATION_DISABLED` | no | `1` → mint sessions without Responses delegation (degraded: voice only, no deep reasoning). |
| `DATABASE_URL` | no | Postgres connection string. Unset → in-memory harness store, nothing persisted. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | no | Mint rate limit per IP (default 10/min). Each mint bills a 15s voice-duration credit — keep this tight. |
| `NEXT_PUBLIC_LIVE_BACKEND_URL` | frontend | Vercel env var pointing at the backend. Without it `/live` shows "not configured". |
| `NEXT_PUBLIC_LIVE_TUTOR_ENABLED` | frontend | `1` to render the `/live` tutor. Default off — merging never exposes the route by accident. |

## Database migrations (PR 4)

```bash
cd live-backend
DATABASE_URL=<redacted> npm run migrate   # tsx src/memory/migrateCli.ts
```

Migrations are versioned SQL in the repo. Raw session data older than
`MEMORY_RETENTION_DAYS` (default 180) is purged; learner-level aggregates are kept.

## Logs — vocabulary

All backend logs go to stdout (Railway → service → Logs). Every major event
carries `sessionId`; tool/turn events also carry `turnId`.

| prefix | examples | meaning |
|---|---|---|
| `[live] session created id=… create_ms=… delegation=…` | — | successful mint; `create_ms` is the OpenAI round-trip |
| `[live] session <id> started (sideband ready)` | — | sideband attached, session observable |
| `[live] transcript <id> <user\|assistant>: …` | — | completed speaker turn (first 120 chars) |
| `[live] session <id> closed (reason=…)` | — | graceful close; harness state abandoned, store flushed |
| `[live] session <id> sideband error: …` | — | sideband socket error; reconnect attempted (see below) |
| `[live] session creation failed: …` | — | mint failed; `API key rejected` means the key lacks GPT-Live access or is invalid |
| `[live] harness initialized session=… objective=… learner=…` | — | harness state created (best-effort; voice survives init failure) |
| `[memory] …` | `persist failed (attempt N)` | write-behind queue retries with backoff; dropped ops are re-covered by the next sync |
| `{"component":"harness-tools",…}` | JSON, one per tool dispatch | `sessionId`, `tool`, `turnId`, `readOnly`, `ok`, `errorCode`, `replayed`, `durationMs` |
| delegation log lines | via `DelegationManager` log | `delegation created/completed/failed`, `function call collected`, `delegation batch executed`, `tool execution blocked by guardrail` (all with `sessionId`, `delegationId`, `callId`) |
| guardrail triggers | via `onTrigger` → logs | `kind` (`answer_leak` \| `teaching_ahead`), `sessionId`, excerpt, plus the corrective `session.instructions.append` command |

`GET /metrics` aggregates the counters (no PII): latency p50/p95 per label,
`guardrail.triggered` by kind, `teaching.move` distribution,
`delegation.created/completed/failed`, `sessions.created/closed/errored`,
active session count.

## Common incidents

**Learners can't start sessions (mint 500 `misconfigured`).**
The OpenAI key is rejected. Check the Railway variable, then validate the key
has GPT-Live access (`POST /v1/live/sessions` with a test SDP should reach
SDP validation, not 401/403). The browser fails fast on this (no retries) —
the error panel will say so. See "Rotating the OpenAI key".

**Mint 403s.** `ALLOWED_ORIGIN` doesn't include the frontend origin. Add the
Vercel URL (including `https://`).

**Mint 429s.** Rate limiter is biting (default 10/min/IP). If legitimate,
raise `RATE_LIMIT_MAX`; if abuse, tighten `ALLOWED_ORIGIN`.

**Sideband drops mid-session.** The backend reconnects with backoff
(`SIDEBAND_MAX_RECONNECT_ATTEMPTS`, default 5). Watch for
`[live] session <id> sideband error` followed by re-attach. If reconnects
exhaust, the session is marked closed server-side; the voice call may
continue briefly but is unobserved — the learner should start a new session.
Harness state for the dead session is abandoned; the learner's *concepts*
survive via Postgres write-behind and are restored on the next session
(`prepareSession`), but the in-progress turn is lost. See
`docs/limitations.md`.

**Backend restart.** All in-memory state is lost: session registry, sideband
sockets, delegation managers, unflushed write-behind queue (up to
`MEMORY_FLUSH_INTERVAL_MS` of recent evidence — 5s default). Postgres keeps
everything flushed before the restart. Active voice sessions are orphaned;
learners start new sessions and resume from restored concept knowledge.

**Guardrail firing often.** Check `/metrics` → `guardrail.triggered` by kind.
Frequent `answer_leak` means the voice model's instructions need tightening
or the curriculum's live targets are misconfigured; frequent
`teaching_ahead` means the model is reaching for unintroduced concepts —
check the curriculum's concept ordering. Both are evaluated controls: fix the
inputs, don't just silence the guardrail.

**Delegation slow.** `/metrics` → `delegation.roundtrip_ms` p95. Consider
`LIVE_DELEGATION_MODEL=gpt-5.6-luna` (cost/latency trade-off) or check
whether the fast path is misfiring into delegation (`delegation.created`
should be ~0 for routine exchanges).

## Rotating the OpenAI key

1. Create the new key in the OpenAI dashboard (project key, GPT-Live access).
2. Railway → `live-backend` → Variables → set `OPENAI_API_KEY` → redeploy
   (variable change triggers a deploy; or `railway up -d -s live-backend`).
3. Existing sessions were minted with the old key and die naturally; new
   mints use the new key. No coordinated cutover needed.
4. Revoke the old key in the OpenAI dashboard once the deploy is healthy.

Note: keys pasted in chat end up in the transcript — rotate after any
chat-based provisioning.
