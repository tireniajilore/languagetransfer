---
name: tiktok-lt-render
description: >-
  Stage 3 of the LT→TikTok pipeline: render a TikTok language micro-lesson with
  Remotion from its segment JSON + synthesized audio, keeping the visuals
  consistent across clips. Use whenever the user wants to render/build a lesson
  video, wire a new lesson composition into the Remotion app, fix or adjust the
  on-screen visuals (prompts, reveals, karaoke, blooms, header), or make two
  clips look consistent. Triggers on "render lesson 02", "build the vowels
  video", "the SAY IT countdown is missing", "remove the header", "make lesson 1
  and 2 look the same", "wire up a Lesson03 composition". Consumes a segment JSON
  (tiktok-lt-script) and audio mp3s (tiktok-lt-voice); produces out/<id>.mp4.
---

# TikTok LT — Render stage

Render a lesson video with the Remotion app and keep it visually consistent with
the project's other clips. Input: `tiktok/scripts/<id>.json` +
`public/audio/<id>/seg-NN.mp3`. Output: `out/<id>.mp4`.

Project: `/Users/tireniajilore/Documents/voiceai/tiktok/remotion`. **Read
`references/remotion-pipeline.md` before touching the engine or rendering** — it
has the file map, the audio-driven timing, the composition wiring, the commands,
and the visual system rules.

## Workflow

1. **Wire the composition** (if new) — point `src/lesson.ts` at the lesson JSON
   (or generalize it to take an id) and register a `<Composition>` in
   `src/Root.tsx` mirroring `Lesson02`. Exact code in the reference.
2. **Typecheck:** `npx tsc --noEmit`.
3. **Dry layout check** (optional, before audio): render a still —
   `npx remotion still src/index.ts <CompId> out/_x.png --frame=N` — durations
   fall back to a dry estimate when audio is missing.
4. **Render:** `npx remotion render src/index.ts <CompId> out/<id>.mp4`. Scene
   durations are measured from the audio automatically.
5. **Verify by looking.** Rendering is silent code — never declare done from a
   successful render alone. Extract frames
   (`ffmpeg -ss <sec> -i out/<id>.mp4 -frames:v 1 f.png`) and read them; open the
   mp4 for the user.
6. **Create review/final artifacts.** Extract a voice preview from the final MP4
   into `out/voice-previews/`. When the user asks to finalize, copy the completed
   MP4 into `out/finalized/` with the lesson id in the filename.

## Visual consistency (the brand — non-negotiable)

Every clip must look the same. Full spec in `references/remotion-pipeline.md`
§ Visual system; the checkpoints to verify on every render:

- **No `LANGUAGE TRANSFER` header** (removed on purpose).
- **Prompt beat:** big word + lime `SAY IT` + a shrinking lime countdown.
- **Reveal beat:** big word + `phon` below in lime mono. No kicker, no gloss.
- **Long text:** prompt/reveal text must wrap or resize inside the TikTok safe
  width. Check any sentence over ~20 characters, especially `Normalmente...`,
  `Posiblemente...`, and `Probablemente...`.
- **Teaching lines:** karaoke (words highlight in time with the voice).
- **Canvas:** near-black green + soft blooms; Geist + Geist Mono; single lime
  accent; thin lime progress bar; fade-only motion.

If you change one clip's prompt/reveal/header/chrome, **mirror it in the other
clip** so the cognate clip (`CognateClip`/`Card.tsx`) and the lesson clip
(`LessonClip`) stay identical. They currently share the exact treatment.

## References

- `references/remotion-pipeline.md` — engine files, audio-driven timing, how to
  add a composition, the render/verify commands, and the full visual system.
