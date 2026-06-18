# Remotion pipeline

The renderer is a Remotion app at `tiktok/remotion`. Lessons are audio-driven:
scene durations are measured from the synthesized clips, so timing always
matches the voice.

## Files

| file | role |
|---|---|
| `tiktok/scripts/<id>.json` | the lesson script (segments) |
| `src/lesson.ts` | loads the lesson, `buildLessonScenes()` → scenes with durations |
| `src/LessonClip.tsx` | the composition component — renders each segment kind |
| `src/Root.tsx` | registers `<Composition>`s + `calculateMetadata` (measures audio) |
| `scripts/tts-lesson.mjs` | ElevenLabs synthesis → `public/audio/<id>/seg-NN.mp3` |
| `src/theme.ts` | colors, fonts, type scale (shared with the cognate clip) |
| `src/components/Background.tsx` | atmospheric blooms canvas |
| `src/components/Karaoke.tsx` | word-by-word caption highlight (used by `line`) |
| `src/components/Overlays.tsx` | `ProgressBar` |

## How timing works (audio-driven)

`Root.tsx`'s `calculateMetadata` measures each clip with
`getAudioDurationInSeconds(staticFile('audio/<id>/seg-NN.mp3'))` and passes the
durations to `buildLessonScenes(lesson, durations)`. Each scene's length =
audio + a small pad. Pacing constants in `lesson.ts`:

- `PAD ≈ 0.35s` — breathing room after a teaching line.
- `BEAT ≈ 1.3s` — the silent thinking pause on a `prompt` (the try-before-reveal gap).
- `HOLD ≈ 0.7s` — hold after a `reveal` lands.

If a clip is missing, it falls back to a dry word-count estimate, so the comp
still builds before audio exists (good for dry layout checks).

## Adding a new lesson composition

`lesson.ts` currently imports one lesson JSON statically. To add a lesson,
either (simplest) point `lesson.ts` at the new JSON, or generalize it to take an
id. Then register a composition in `Root.tsx` mirroring `Lesson02`:

```tsx
const lessonAudioKeys = lesson.segments
  .map((s, i) => (s.say ? audioKeyFor(i) : null))
  .filter((x): x is string => x !== null);

const calculateLessonMetadata = async () => {
  const durations = {};
  await Promise.all(lessonAudioKeys.map(async (k) => {
    try { durations[k] = await getAudioDurationInSeconds(staticFile(`audio/${lesson.id}/${k}.mp3`)); } catch {}
  }));
  const scenes = buildLessonScenes(lesson, durations);
  return { durationInFrames: lessonTotalFrames(scenes), props: { scenes } };
};

<Composition id="Lesson02" component={LessonClip} durationInFrames={1}
  fps={FPS} width={WIDTH} height={HEIGHT}
  defaultProps={{ scenes: [] }} calculateMetadata={calculateLessonMetadata} />
```

The composition `id` is what you pass to `remotion render`.

## Commands

```bash
cd tiktok/remotion
npx tsc --noEmit                                              # typecheck first
node scripts/tts-lesson.mjs <id>                             # synth all clips
node scripts/tts-lesson.mjs <id> 4 6 8                       # re-synth indices
npx remotion still   src/index.ts <CompId> out/_x.png --frame=N   # dry layout check
npx remotion render  src/index.ts <CompId> out/<id>.mp4           # final
ffmpeg -y -i out/<id>.mp4 -vn -codec:a libmp3lame -q:a 3 out/voice-previews/<id>-voice-preview.mp3
cp out/<id>.mp4 out/finalized/<id>.mp4                            # when approved/finalized
```

Verify by reading frames and opening the mp4. `out/` is gitignored; audio mp3s
are gitignored too (regenerate with the script). For precise text checks, frame
selection is more reliable than timestamp seeking:

```bash
ffmpeg -y -i out/<id>.mp4 -vf "select=eq(n\\,<frame>)" -frames:v 1 out/check.png
```

For uncertain reveal timing, make a contact sheet around the expected region:

```bash
ffmpeg -y -i out/<id>.mp4 \
  -vf "select='eq(n,1500)+eq(n,1560)+eq(n,1620)+eq(n,1680)',scale=270:480,tile=4x1" \
  -frames:v 1 out/checks/<id>-around.png
```

## Visual system (keep all clips consistent)

This is the brand — every clip must look the same. Defined in `theme.ts`:

- **Canvas:** near-black green (`#0a0e09`) + two soft radial blooms (sky upper,
  lime lower). Fixed, no animation. (`Background.tsx`.)
- **Type:** Geist (display/body) + Geist Mono (the `phon` pronunciation). One
  family each; lime accent.
- **Accent:** a single luminous lime (`#96ee60`). Used on the answer, `SAY IT`,
  the countdown, the progress bar. Everything else is lavender-white ink or
  muted green-grey.
- **No brand header.** There is NO "LANGUAGE TRANSFER" text. (Removed on purpose.)
- **Prompt beat:** big word (ink) + `SAY IT` (lime, letterspaced) + a shrinking
  lime countdown line. Identical in the lesson clip and the cognate clip.
- **Reveal beat:** big word (ink) + `phon` below in lime mono. No gloss, no kicker.
- **Long prompt/reveal text:** dynamic sizing and wrapping must keep the full
  sentence inside `ACTIVE_WIDTH`. Always inspect long sentences such as
  `Normalmente no es diferente`, `Posiblemente no es imposible`, and
  `Probablemente es posible`.
- **Teaching lines:** karaoke — the spoken words highlight ink as they're said,
  upcoming words muted. (`Karaoke.tsx`.)
- **Motion:** fade / cross-dissolve only. No slides, no bounce, no spinners.
- **Chrome:** a thin lime progress bar at the bottom. No counter, no kicker.

When you touch one clip's prompt/reveal/header, mirror the change in the other so
the cognate clip (`CognateClip` / `Card.tsx`) and the lesson clip (`LessonClip`)
stay identical. They currently share the exact prompt/reveal treatment.
