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

## Structure

- `src/app` - Next.js App Router entrypoint
- `src/data/lesson-02.ts` - seed lesson converted from the existing JSON transcript
- `src/lib/parse-transcript.ts` - deterministic turn-to-step converter
- `src/engine` - reducer and hook for playback / prompt state
- `src/components` - lesson player UI
- `src/adapters` - browser/text adapters plus future runtime stubs

## Notes

- No backend, API routes, database, or LLM runtime are used.
- The timeout path records a timed-out response and advances automatically for the MVP.
- `ElevenLabs` and `Whisper` adapter files are intentionally stubs.
