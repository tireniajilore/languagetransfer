---
name: tiktok-lt-voice
description: >-
  Stage 2 of the LT→TikTok pipeline: synthesize the ElevenLabs voiceover for a
  TikTok language-lesson segment JSON, getting bilingual pronunciation right. Use
  whenever the user wants to generate/regenerate the voice for a lesson, run the
  TTS, or — especially — fix pronunciation problems like "the Spanish word is
  coming out English in the voiceover", "metal sounds Spanish in the prompt",
  "the voice sounds robotic", "make Brian say the cognate in English", or "re-do
  the audio for lesson 02". Encodes the cognate code-switching fix, carrier
  phrases, language tags, and the model/voice choices. Consumes a segment JSON
  (from tiktok-lt-script); produces mp3s for tiktok-lt-render.
---

# TikTok LT — Voice stage

Synthesize the voiceover for a lesson's segment JSON with ElevenLabs, getting the
bilingual pronunciation right. Input: `tiktok/scripts/<id>.json` (segments with
`say` + `lang`). Output: `public/audio/<id>/seg-NN.mp3` (one per spoken segment,
keyed by index). Hand off to **tiktok-lt-render**.

Project: `/Users/tireniajilore/Documents/voiceai/tiktok/remotion`.

## Workflow

1. **Read `references/elevenlabs.md` first.** Bilingual TTS pronunciation is the
   whole difficulty of this stage; the reference is the playbook (the cognate
   problem, what works, what wastes time, the fallbacks).
2. **Synthesize:**
   ```bash
   cd tiktok/remotion
   node scripts/tts-lesson.mjs <lesson-id>          # all spoken segments
   node scripts/tts-lesson.mjs <lesson-id> 4 6 8    # re-synth only these indices
   ```
   Each spoken segment (`say`) becomes `seg-NN.mp3` (NN = segment index). Silent
   beats (no `say`) get no clip.
3. **Listen — always.** TTS can't be verified by reading text. Open the clips
   (or stitch them) and confirm English words sound English, Spanish words sound
   Spanish, and accent/clean-S details land. Re-synth just the offending index
   and listen again — it's cheap.
4. **For rendered lessons, extract a voice preview from the final MP4.** After
   rendering, make the review MP3 from the video audio so it includes the real
   silent prompt pauses: `ffmpeg -i out/<id>.mp4 -vn ... out/voice-previews/<id>-voice-preview.mp3`.
5. **Stop and let the user approve the voice** before rendering when working in
   strict staged mode. If the user asks to build end-to-end, continue through
   render and provide the preview MP3.

## The one thing that matters most

Words spelled the same in both languages (animal, metal, natural, legal) make
the model guess the language from context — and an isolated word guesses wrong.
The fix is **carrier phrases + a `lang` tag per segment**, not phonetic
respellings (those sound robotic). If the script already uses carriers
("What about metal?" / "En español, metal."), most of the battle is won. Full
detail, the model/voice choice (Brian on `eleven_v3`), and the deterministic
fallback (`language_code` on turbo v2.5) and two-voice options are in
`references/elevenlabs.md`.

If a cognate still comes out wrong: first check the script uses a carrier (fix in
the script stage if not); then try the turbo + `language_code` route; only then
consider respelling — and only ever in `phon` (display), never in `say`.

## Prompt and reveal phrasing

- English prompts should stay English: `Really, it is urgent.`
- Spanish reveals should use short carriers: `En español: Realmente es urgente.`
- Do not over-Spanish the whole response. Keep explanatory English in `line`
  segments; keep Spanish answer segments short and clearly tagged `lang: "es"`.
- Silent quick-fire prompts are allowed and often better: a `prompt` with `word`
  and no `say`, followed by the voiced Spanish reveal.
- Sentence-combo prompts need enough silent time for production. Use the
  script's `pauseSec` rather than padding audio.

## References

- `references/elevenlabs.md` — the full pronunciation playbook: setup/keys, the
  cognate problem, what works (carriers + lang), what doesn't (bare words,
  respellings, language_code on v3), the turbo/two-voice fallbacks, and the test
  harnesses in `tiktok/remotion/scripts/`.
