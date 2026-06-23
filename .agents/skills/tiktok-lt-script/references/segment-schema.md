# Segment JSON schema

A lesson script is a JSON file at `tiktok/scripts/<lesson-id>.json`. The `id`
must match the audio folder name (`public/audio/<id>/`).

## Top level

```json
{
  "id": "lesson-02-vowels",
  "title": "Spanish Vowels Make The Accent",
  "voice_notes": "Patient Language Transfer teacher. Warm, unhurried.",
  "segments": [ /* ... */ ],
  "caption": "TikTok caption text...",
  "hashtags": ["learnspanish", "spanishtok", "spanish"]
}
```

## Segment fields

Every segment has a `kind`. Other fields depend on the kind. A segment with a
`say` becomes a spoken ElevenLabs clip (`seg-NN.mp3`, NN = its index); a segment
without `say` is a silent beat.

| field | applies to | meaning |
|---|---|---|
| `kind` | all | `line` · `vowels` · `prompt` · `reveal` |
| `lang` | all spoken | `"en"` or `"es"` — drives pronunciation. **Always set it.** |
| `say` | spoken | the voiceover text (may be a carrier phrase, see [the voice playbook](../../tiktok-lt-voice/references/elevenlabs.md)) |
| `show` | `line` | concise on-screen text (karaoke-highlighted); use `\n` for breaks |
| `word` | `prompt`,`reveal` | the big on-screen word |
| `phon` | `reveal` | on-screen pronunciation guide (e.g. `na-too-RAL`) — display only |
| `pauseSec` | `prompt` | optional try-before-reveal pause override. Use longer pauses for multi-piece sentence builds. |

## The four kinds

- **`line`** — a teaching sentence. On screen: the `say` text as **karaoke**
  (words highlight in time with the voice). Use for hooks, explanations, closers.
  (`show` exists as a fallback/condensed label but the render karaokes `say`.)
- **`vowels`** — the special five-vowel chart (a→ah … u→oo), staggered in. The
  `say` is the spoken line; the chart visual is fixed in the component.
- **`prompt`** — the "your turn" beat. Shows `word` + `SAY IT` + a shrinking
  countdown. `say` is the English carrier ("Take the English word metal" /
  "What about metal?"). The silent thinking pause is built into the scene length.
- **`reveal`** — the answer. Shows `word` + `phon` (lime). `say` is the Spanish
  carrier ("En español, metal").

## Worked example (Lesson 2 — vowels)

```json
{
  "id": "lesson-02-vowels",
  "title": "Spanish Vowels Make The Accent",
  "segments": [
    { "kind": "line",   "lang": "en", "say": "Reading Spanish out loud is way easier than English. Here's the reason.", "show": "Reading Spanish\nis easier than English" },
    { "kind": "line",   "lang": "en", "say": "English vowels are chaos.", "show": "English vowels\nare chaos" },
    { "kind": "line",   "lang": "en", "say": "A says apple. May. About. One letter, three sounds.", "show": "A\napple · may · about" },
    { "kind": "line",   "lang": "en", "say": "Spanish vowels never move. Five sounds, locked.", "show": "Spanish vowels\nnever move" },
    { "kind": "vowels", "lang": "es", "say": "a, e, i, o, u." },
    { "kind": "prompt", "lang": "en", "say": "Take the English word natural.", "word": "natural" },
    { "kind": "reveal", "lang": "es", "say": "En español, natural.", "word": "natural", "phon": "na-too-RAL" },
    { "kind": "prompt", "lang": "en", "say": "Take the English word metal.", "word": "metal" },
    { "kind": "reveal", "lang": "es", "say": "En español, metal.", "word": "metal", "phon": "meh-TAL" },
    { "kind": "line",   "lang": "en", "say": "You didn't memorize four words.", "show": "you didn't memorize\nfour words" },
    { "kind": "line",   "lang": "en", "say": "You learned five sounds, and now you can read all of them.", "show": "you learned\nfive sounds" }
  ],
  "caption": "Spanish is easier to read out loud than English — the vowels never change. Then read these: natural, metal, legal, ideal.",
  "hashtags": ["learnspanish", "spanishtok", "spanish", "languagelearning", "fyp"]
}
```

## Notes

- `prompt` and `reveal` usually share the same `word` (it's a cognate — same
  spelling, the change is stress/vowels). `phon` shows the Spanish stress.
- Keep teaching `say` lines short and audio-friendly (no spelling/diacritic talk
  to the listener).
- Quick-fire word prompts can omit `say` and rely on the on-screen `word`; keep
  these short (`pauseSec` around 0.9–1.1). Full-sentence prompts should usually
  include an English `say` carrier plus a longer pause (`pauseSec` around
  2.3–3.5 depending on length).
- For longer combination prompts, keep the spoken prompt short and let `word`
  carry the full on-screen sentence. The reveal should use a short Spanish
  carrier such as `En español: Normalmente no es diferente.`
- The segment *index* is the audio key, so reordering segments re-keys the audio
  — re-synth after reordering.
- New `kind`s (e.g. a sentence-builder for `es`/`no es`) require a matching
  renderer in `LessonClip.tsx`. Reuse `line`/`prompt`/`reveal` where you can.
