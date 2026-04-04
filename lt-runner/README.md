# LT Runner

Single-lesson Language Transfer runner MVP built in Next.js + TypeScript.

## What it does

- Loads lesson 02 directly on the home page
- Runs the lesson with a deterministic client-side reducer
- Uses Web Speech API when available for browser TTS
- Falls back to text-only pacing when browser speech is unavailable
- Captures responses through a text input for the MVP
- Keeps the original Python/React app untouched for reference

## Commands

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## ElevenLabs setup

Create `lt-runner/.env.local` with:

```bash
ELEVENLABS_API_KEY=your_new_key_here
```

Optional:

```bash
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

- Requests go from the browser to `/api/tts`, then the server route calls ElevenLabs.
- Mixed-language steps can define explicit `segments` so Spanish words are synthesized independently from surrounding English.
- If ElevenLabs is unavailable before playback begins, the app falls back to BrowserTTS. If a failure happens mid-step, the engine falls back to its timing-based advance.

## Structure

- `src/app` - Next.js App Router entrypoint
- `src/data/lesson-02.ts` - seed lesson converted from the existing JSON transcript
- `src/lib/parse-transcript.ts` - deterministic turn-to-step converter
- `src/data/lesson-02-segments.ts` - manual mixed-language segment overrides for lesson 02
- `src/engine` - reducer and hook for playback / prompt state
- `src/components` - lesson player UI
- `src/adapters` - browser/text adapters plus future runtime stubs

## Notes

- No backend, API routes, database, or LLM runtime are used.
- The timeout path records a timed-out response and advances automatically for the MVP.
- The active voice path is ElevenLabs with explicit segment overrides for mixed English/Spanish tutor lines.
