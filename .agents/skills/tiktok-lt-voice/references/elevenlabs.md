# ElevenLabs pronunciation playbook

The core problem in a bilingual teaching clip: you need some words said in clean
English and the same-spelled words said in clean Spanish. Getting this right is
most of the work. Read this fully before synthesizing.

## Setup

- **Voice:** Brian, `Czw3Dn181ypdrCOnPfif` (American English narrator, warm).
- **Model:** `eleven_v3` — expressive and warm, the chosen default. *But it
  auto-detects language from context and offers no hard language switch.*
- **API key:** `ELEVENLABS_API_KEY` in repo-root `.env` (also in
  `lt-runner/.env.local`). The key is **TTS-scoped** — it can synthesize but
  returns 401 on `GET /v1/voices`, so you can't list the voice library with it.
- **Endpoint:** `POST https://api.elevenlabs.io/v1/text-to-speech/<voiceId>?output_format=mp3_44100_128`
  body `{ text, model_id, language_code?, voice_settings:{stability:0.5, similarity_boost:0.8} }`.
- **Synthesize via:** `node scripts/tts-lesson.mjs <lesson-id> [indices...]`.
  Re-synth single segments by index while tuning — cheap, avoids re-rendering.

## The cognate code-switching problem

Words spelled identically in English and Spanish — **animal, metal, natural,
legal, ideal, normal, hospital, capital** — are the whole point of the content
and the whole problem. v3 reads the spelling and guesses the language from
surrounding context.

- An **isolated** word (`"Metal."`) has no context → it guesses **Spanish**
  (wrong, when you wanted the English prompt).
- A full English sentence keeps "metal" English; a Spanish frame keeps it
  Spanish.

So: **context is the lever, not the spelling.**

## What works: carrier phrases + per-segment `lang`

Never synthesize a bare cognate. Wrap it in a short carrier that anchors the
language, and tag the segment's `lang`. Real words, natural prosody.

- **English prompt** → `"Take the English word metal."` or `"What about
  metal?"` (lang `en`). Lands English.
- **Spanish reveal** → `"En español, metal."` (lang `es`). Lands Spanish.

This is the project's chosen approach: **Brian on v3 + carrier context.** It
keeps v3's warmth and needs no respelling.

## Bilingual lesson phrasing patterns

Use the JSON language tag and the carrier together:
- English prompt: `say: "Probably, it is possible."`, `lang: "en"`.
- Spanish reveal: `say: "En español: Probablemente es posible."`, `lang: "es"`.

Keep Spanish answer carriers short. Avoid long mixed-language reveal text like
"The Spanish answer is..." because it weakens the language cue and slows the
payoff. Put explanation in English `line` segments, then reveal with
`En español: ...`.

Quick-fire word tests may be silent on the prompt: show the English word on
screen, pause briefly, then voice only the Spanish reveal. Longer sentence builds
should usually voice the English prompt and use `pauseSec` for the thinking
time.

## What does NOT work (don't waste time here)

- **Bare cognate words** — guess wrong. Always add a carrier.
- **Phonetic respellings** (`MET-ul`, `NATCH-er-ul`, `na-too-RAL` *as the spoken
  text*) — they force the language but **sound robotic / over-enunciated.** The
  user rejected these. Keep respellings for the on-screen `phon` field *only*,
  never as `say`.
- **`language_code` on `eleven_v3`** — v3 doesn't honor it for isolated
  cognates; the word still flips. (v3 ignores/under-weights it.)
- **Letter-name recitation via respelling** (`"eigh, ee, eye, oh, you"`) — `ay`
  was read as "I"; brittle. For the vowels chart, just say `"a, e, i, o, u."`
  with lang `es` (Brian says them Spanish) and let the on-screen chart carry the
  English→Spanish contrast.

## The deterministic alternative (if v3 ever isn't reliable enough)

`eleven_turbo_v2_5` (and `eleven_flash_v2_5`) **do** honor `language_code`. With
a carrier phrase **and** `language_code`, the switch is reliable. Tested result:
carrier + turbo + `en` lands English every time; v3 + carrier was ~right but
occasionally flipped. **Cost:** turbo/flash are flatter / less warm than v3.

Decision tree:
1. Default: **Brian v3 + carrier phrases** (warm). Spot-check the cognates.
2. If a cognate still flips: same carrier on **turbo v2.5 + `language_code`**
   (deterministic, slightly flatter). You may switch the whole lesson to turbo
   for one consistent voice.
3. Pedagogical upgrade: **two voices** — Brian (English) + a *native Spanish*
   voice for the `es` reveals/vowels. Best Spanish quality and the voice change
   cues the language. Needs a Spanish voice ID (ask the user — the key can't
   list the library). The A/B harness `scripts/tts-ab-modes.mjs` renders
   one-voice vs two-voice for comparison.

## Always listen before declaring done

TTS pronunciation can't be verified by reading text. After synthesizing, open
the clips (or the stitched lesson VO) and confirm: English words sound English,
Spanish words sound Spanish, the clean-S / accent details land. Re-synth the one
offending segment and listen again.

For final review, prefer extracting an MP3 from the rendered MP4 instead of
stitching raw clips. The MP4-derived preview preserves the real silent prompt
pauses and scene timing.

## Test harnesses in the repo

If you need to probe behavior or compare options, these already exist under
`tiktok/remotion/scripts/` (they stitch clips into one mp3 for easy listening):
- `tts-test.mjs` / `tts-test2.mjs` — quick A/B of models / carriers.
- `tts-ab-modes.mjs <lesson> <model>` — one-voice vs two-voice for a whole lesson.
- `tts-v3-rescue.mjs` — grid of English-anchor phrasings on v3.
