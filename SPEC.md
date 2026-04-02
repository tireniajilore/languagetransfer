# Voice AI Spanish Tutor - Scripted Conversation Redesign

## The Problem

The current implementation is **wrong**. It treats lessons as isolated flashcard-style exercises:
- User sees prompt → records answer → gets feedback → clicks "Next"

The PRD requires a **scripted conversation** that faithfully replicates the Language Transfer format:
- AI tutor speaks exactly what the teacher says in the transcript
- AI pauses only where the student originally spoke
- User IS the student - they speak during those pauses
- AI continues with the teacher's next line (including feedback)

**This is not a quiz. It's a conversation.**

---

## New Data Model

**Current (WRONG):**
```json
{"exercises": [{"prompt": "How would you say metal?", "expected_answers": ["metal"]}]}
```

**New (CORRECT):**
```json
{
  "turns": [
    {"speaker": "tutor", "text": "English and Spanish are two related languages..."},
    {"speaker": "tutor", "text": "How do you think you would say metal?", "is_prompt": true},
    {"speaker": "student", "expected_answers": ["metal"]},
    {"speaker": "tutor", "text": "Metal. Good. How would you say legal?", "is_feedback": true, "is_prompt": true},
    {"speaker": "student", "expected_answers": ["legal"]}
  ]
}
```

---

## Core Flow

```
1. User clicks "Start Lesson"
2. AI tutor speaks Turn 1 (tutor explanation) via ElevenLabs
3. AI tutor speaks Turn 2 (tutor explanation)
4. AI tutor speaks Turn 3 (tutor question: "How would you say...?")
5. PAUSE - System waits for user to speak
6. User speaks their answer
7. (Optional) System transcribes & evaluates
8. AI tutor speaks Turn 4 (feedback + next question)
9. Repeat until lesson complete
```

---

## Implementation Plan

### Phase 1: New Transcript Parser

**File:** `scripts/parse_transcript_v2.py`

Use Gemini to parse raw transcripts into turn-by-turn JSON:
- Identify TUTOR turns (long explanations, questions, feedback)
- Identify STUDENT turns (short 1-5 word Spanish responses)
- Mark `is_prompt` for questions expecting response
- Mark `is_feedback` for turns that respond to student
- Extract `expected_answers` for student turns

**Output:** `data/lessons_v2/lesson_02.json`, `lesson_03.json`, `lesson_04.json`

### Phase 2: Backend Changes

**New file:** `server/routers/conversation.py`
```
POST /api/conversation/start       - Start lesson, return session_id
GET  /api/conversation/{id}/turn   - Get ONE atomic tutor turn (audio URL + text)
POST /api/conversation/{id}/respond - Submit user audio, get evaluation
POST /api/conversation/{id}/advance - Move to next turn (after respond or skip)
```
Note: Each turn is atomic. Prefetching happens via background requests, but
the API always delivers ONE turn at a time to preserve natural pacing.

**Modify:** `server/services/elevenlabs_tts.py`
- Add audio caching (don't regenerate same text)
- Add prefetch support for next N turns

**New file:** `server/services/conversation_state.py`
- Track current turn index per session
- Store user responses for progress

### Phase 3: Frontend Redesign

**New file:** `web/src/components/ConversationView.jsx`

Replaces LessonView + ExerciseCard with a continuous conversation UI:

```
+------------------------------------------+
|  Lesson 2                                |
+------------------------------------------+
|                                          |
|  [Live Transcript - scrollable]          |
|                                          |
|  "English and Spanish are two            |
|   related languages..."                  |
|                                          |
|  "How would you say metal?"              |
|                                          |
|  · · ·  (waiting)                        |
|                                          |
|  [After 5s: "Take your time..."]         |
|  [After 10s: soft audio nudge]           |
|                                          |
+------------------------------------------+
|    [Record]    [Skip]    [Pause]         |
+------------------------------------------+
|  ----------------------------------------|  <- subtle, thin, no %
+------------------------------------------+
```

**New file:** `web/src/hooks/useConversation.js`
- Manages playback state: `playing | waiting | paused | complete`
- Handles audio queue (prefetch next turns)
- Handles recording and submission

### Phase 4: Audio Strategy

**Approach:** Just-in-time generation with caching

1. When lesson starts, generate audio for first 3-5 tutor turns
2. While Turn N plays, prefetch Turn N+1, N+2
3. Cache generated audio in `data/audio/lesson_XX/turn_XX.mp3`
4. On replay, use cached audio

---

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/parse_transcript_v2.py` | Gemini-powered turn parser |
| `data/lessons_v2/lesson_02.json` | Turn-based lesson data |
| `data/lessons_v2/lesson_03.json` | Turn-based lesson data |
| `data/lessons_v2/lesson_04.json` | Turn-based lesson data |
| `server/routers/conversation.py` | Conversation session API |
| `server/services/conversation_state.py` | Session state management |
| `web/src/components/ConversationView.jsx` | Main conversation UI |
| `web/src/hooks/useConversation.js` | Conversation state hook |

## Files to Modify

| File | Changes |
|------|---------|
| `server/main.py` | Register conversation router |
| `server/services/elevenlabs_tts.py` | Add caching, prefetch |
| `web/src/App.jsx` | Use ConversationView |
| `web/src/api/tutor.js` | Add conversation API calls |

## Files to Deprecate (keep but unused)

- `web/src/components/ExerciseCard.jsx`
- `web/src/components/LessonView.jsx`
- `web/src/hooks/useLesson.js`
- `data/lessons/lesson_*.json` (old format)

---

## Key Design Decisions

### 1. User Response Handling
**Decision:** Optional Mode
- User CAN speak, but can also click "Skip" to continue
- Matches Language Transfer philosophy: "Take your time, no pressure"
- Evaluation shown as subtle indicator, not blocking

### 2. Incorrect Answers
**Decision:** Gentle Correction
- Continue with script regardless (tutor says feedback anyway)
- Show visual indicator (green / yellow / red)
- User can tap to see what they said vs expected

### 3. Audio Generation
**Decision:** Hybrid caching
- Generate on-demand, cache for replay
- Prefetch next 3 turns while current plays
- No upfront generation of all 90 lessons

### 4. Mixed Language
**Decision:** Use ElevenLabs multilingual model
- Already configured: `eleven_multilingual_v2`
- Handles English + Spanish naturally

### 5. Atomic Turns (API Design)
**Decision:** One turn = one utterance
- API always returns ONE tutor turn at a time
- Prefetching happens in background, but delivery is atomic
- Frontend plays: one voice → one utterance → silence or continuation
- Never bundle multiple turns in a single response

### 6. Minimal UI Instrumentation
**Decision:** De-emphasized progress
- NO prominent progress bars or percentages
- NO "lesson complete" celebration screens
- Subtle indicator only (thin line at bottom, or none)
- Goal: user forgets they're "progressing" — they're just thinking

### 7. Silence Management (Critical UX)
**Decision:** Gentle verbal nudges, never auto-advance

| Silence Duration | Behavior |
|------------------|----------|
| 0-5 seconds | Normal waiting (mic icon pulses gently) |
| 5-10 seconds | Soft text: "Take your time..." |
| 10-20 seconds | Gentle audio nudge: "Whenever you're ready..." |
| 20+ seconds | Stay waiting — NEVER auto-advance |

- User must explicitly click Skip or speak to continue
- Silence is pedagogically correct
- Awkward silence is UX poison — soft nudges bridge the gap

---

## Implementation Order

1. **Parser first** - Create turn-based JSON for Lessons 2-4
2. **Backend API** - Conversation session endpoints
3. **Frontend** - ConversationView + useConversation hook
4. **Polish** - Caching, prefetch, visual feedback

---

## MVP Scope

- Lessons 2, 3, 4 only (same as current)
- ~60 total turns across 3 lessons
- Basic UI with transcript display
- Recording + transcription + optional evaluation
- Subtle progress tracking
