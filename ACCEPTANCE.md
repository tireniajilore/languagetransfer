# Acceptance Criteria — Conversation Redesign MVP (Lessons 2–4)

## Data model
- Lesson JSON uses `turns[]` with `speaker: tutor|student`.
- Tutor turns may include: `text`, `is_prompt`, `is_feedback`.
- Student turns include: `expected_answers[]`.

## Flow
- App plays tutor turns sequentially using ElevenLabs TTS.
- App pauses ONLY on student turns.
- On student turn: user can Record OR Skip OR Pause.
- No "Next" button that advances arbitrarily; advancement is driven by the scripted turns.

## Silence behavior
- 0–5s: waiting state
- 5–10s: show "Take your time…"
- 10–20s: play a gentle audio nudge ("Whenever you're ready…") (TTS)
- 20s+: stay waiting (no auto-advance)

## Atomic turn API
- Backend returns ONE tutor turn at a time.
- Prefetching is allowed but delivery must remain atomic.

## Audio caching
- Tutor audio is cached (replaying the same turn does not regenerate TTS).
- Prefetch next 3 tutor turns while current plays.

## Scope
- Only Lessons 2–4.
- Old flashcard UX is deprecated but kept unused.

## Run
- `npm run dev` works and shows ConversationView.
