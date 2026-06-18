---
name: tiktok-lt-script
description: >-
  Stage 1 of the LT→TikTok pipeline: take a Language Transfer (or LT-style)
  language lesson and break it into short STANDALONE TikTok micro-lessons, then
  write each as "segment JSON" the renderer can use. Use whenever the user wants
  to split a language lesson into bite-size clips, draft a TikTok lesson script,
  author/edit a lesson's segment JSON in tiktok/scripts/, or decide how to
  sequence the teaching. Triggers on things like "split LT Spanish lesson 3 into
  TikToks", "write the es lesson", "draft the script for the vowels clip",
  "author lesson-04-no-es.json", even without the word "skill". Stops at an
  approved .json — voice synthesis and rendering are separate stages
  (tiktok-lt-voice, tiktok-lt-render).
---

# TikTok LT — Script stage

Turn one LT lesson into several **standalone** TikTok micro-lessons and write
each as a segment-JSON file the renderer consumes. Output of this stage:
`tiktok/scripts/<lesson-id>.json` (one per micro-lesson). Hand off to
**tiktok-lt-voice** to synthesize, then **tiktok-lt-render** to render.

Project: `/Users/tireniajilore/Documents/voiceai/tiktok/remotion`; scripts live
in `tiktok/scripts/`.

## Workflow

1. **Find the seams.** One LT lesson holds 2–4 postable ideas (e.g. LT Spanish
   Lesson 2 → vowels, `es`, `no es`). Each becomes its own standalone video.
   See `references/pedagogy.md` § Splitting.
2. **Write each lesson teach-then-prompt.** The most important rule: teach the
   building block first, then prompt the viewer with examples they're now
   equipped for. Never quiz a cold/untaught word. Open on a promise/claim hook,
   not a cold quiz. Full guidance + the LT teaching voice in
   `references/pedagogy.md`.
3. **Encode as segment JSON.** Write `tiktok/scripts/<id>.json` following
   `references/segment-schema.md` (kinds: `line`/`vowels`/`prompt`/`reveal`;
   every segment tagged with `lang`; carrier phrases in `say`; on-screen
   pronunciation in `phon`).
4. **Write a readable transcript.** Whenever you create or materially revise
   lesson JSON, also create/update a nearby Markdown transcript for human review
   (for example `tiktok/scripts/lesson-09-12-readable.md`). The user should not
   need to read JSON to review pacing and copy.
5. **Stop and let the user review** the JSON before handing off. This is a
   review gate — the whole point of keeping the stages separate.

## What to get right here (because later stages depend on it)

- **`lang` on every spoken segment** (`en`/`es`). It drives pronunciation in the
  voice stage — un-tagged segments will mis-synthesize.
- **Carrier phrases, not bare words.** Write `"What about metal?"` /
  `"En español, metal."`, never a bare `"Metal."`. A bare cognate makes the TTS
  guess the language and guess wrong. (Why: it's the central lesson of the voice
  stage; just trust it here and write carriers.)
- **`phon` is display-only** — `na-too-RAL` is the on-screen stress guide, never
  spoken. Don't put respellings in `say`; they sound robotic when voiced.
- **Standalone framing** — no "part two"; re-teach the tiny bit you depend on.
- **Payoff density** — avoid long setup runs. Do not teach more than 1–2 new
  pieces before a prompt; after each useful piece, give a small sentence win
  before adding the next layer.
- **Layered checkpoint shape** — for combination lessons, prefer:
  `piece → small test → new piece → small test → combined sentence → stretch
  sentence`. The stretch sentence should be new as a full sentence, but buildable
  from pieces the viewer has learned in this or prior clips.

## References

- `references/pedagogy.md` — splitting, teach-then-prompt, hooks, the LT
  teaching voice, accuracy traps. Read before writing any script.
- `references/segment-schema.md` — the exact JSON shape, every kind, a full
  worked example. Read before writing the JSON.
