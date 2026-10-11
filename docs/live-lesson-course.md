# Live Complete Spanish: implementation and QA

This course uses **Option A**: fixed canonical Language Transfer concepts,
ordered questions and essential examples, with conversational teaching and
adaptive scaffolding inside each step. It is not a free-topic Spanish chatbot.

## Architecture

- `lt-runner/src/data/lesson-XX.json` is the canonical authored source.
  Its 88 currently available lesson files are mirrored byte-for-byte into
  `live-backend/src/lessons/data/`, so Railway can load them without relying
  on Vercel or runtime requests. When editing an authored lesson, update the
  mirror and the canonical source together.
- `CourseStore` enforces Lesson 2 → 3 → 4, with persisted positions separate
  from concept mastery.
- `LessonSessionManager` owns the current lesson and per-voice-session cursor.
  On reconnection, a resumed lesson re-asks an awaiting question.
- One GPT-Live session per lesson; the model may explain differently and
  handle interruptions, but does not get to select the course order.
- `/api/live/course` returns the course overview and a signed anonymous
  learner token. The browser stores it locally. All progress and next-step
  routes require a session bearer token.

## Deployment

1. Merge PR #26 before PR #27.
2. Railway deploys the `live-backend` directory. Its startup automatically
   runs `0002_lesson_progress.sql` when `DATABASE_URL` is configured.
3. Set `OPENAI_API_KEY`, `DATABASE_URL`, `LEARNER_TOKEN_SECRET` (at least
   32 random characters), `ALLOWED_ORIGIN` (exact Vercel origin) and the
   existing GPT-Live delegation/feature flags on Railway. Do not commit secrets.
4. Vercel: `NEXT_PUBLIC_LIVE_TUTOR_ENABLED=1` and
   `NEXT_PUBLIC_LIVE_BACKEND_URL` pointing to the Railway backend.
5. Visit `/live`: Lesson 2 should be playable; Lesson 3 locked.
6. In `/live/2`, tap **Start Lesson 2**. The model must give the source
   lesson's cognate introduction and ask for *metal*, without asking what
   topic you want to study. Validate with an actual connected browser.
7. Intentionally answer incorrectly, ask a clarification, and answer correctly.
   Check that the lesson cursor advances only after accepted responses.
8. Leave during Lesson 2 and return; you should resume at the required step.
9. Complete Lesson 2, revisit `/live`, verify Lesson 3 unlocks, and start it.
10. Test Safari over both Wi-Fi and 5G; this does **not** provision a TURN relay.

## Known limitations

- The existing authored files must be audited against original Language
  Transfer recordings before claiming verbatim equivalence.
- Speech content cannot be pre-gated: GPT-Live can speak before transcript
  analysis completes. The conductor controls stored progress and authorized
  cues, not every word of spontaneous audio.
- Text matching is deliberately conservative and can reject correct but
  differently transcribed, explanatory or accented responses. Add an
  evidence-grounded semantic assessor before considering production ready.
- Transcript-based advancement is initiated when the sideband observes the
  completed learner utterance, which can lag natural speech. Test timing with
  actual recorded sessions rather than relying on mocks.
- The canonical Lesson 25 file is missing. It is shown as unavailable, and
  later lessons remain locked until this source gap is resolved.
- Anonymous progress is tied to a signed browser token; removing local
  storage loses access to it. There is no cross-device account login yet.

## Regression checks

Run `npm ci && npm run typecheck && npm run lint && npm test` separately in
`live-backend` and `lt-runner`. GitHub Actions also runs the suite on PRs.
The automated tests cannot prove correct spontaneous GPT-Live audio behavior.
