# English / Spanish normal: audio acceptance

Status: unverified prompt improvement. Do not treat this change or passing text tests as a confirmed pronunciation fix.

The reported phone session reached the stress-discovery question, but the learner heard insufficient contrast between the English and Spanish examples. The screenshot's transcript contains the intended labels and capitalization; it cannot establish what the voice pronounced.

## Change

For authorized passages containing the word normal, send language-labelled IPA and plain phonetic guidance privately through session.instructions.append before the passage. Preserve the authored commentary and step/version digest. Explain neither the IPA nor the discovery answer aloud. Keep the same examples and progression. No change to delivery verification, checkpoint rules, transport or voice model.

## Listen before approval

Record a fresh /live/2?eval=1 session and review the audio, not only the trace. Repeat with several new sessions in the selected production voice. Test on phone and desktop. The reference English pronunciation should match the chosen English accent; do not introduce a conflicting global accent.

| Case | Required audible behavior |
|---|---|
| English normal | First syllable stressed; weak second vowel /ə/ |
| Spanish normal | Final syllable stressed; Spanish /o/ and /a/ vowels |
| Mixed comparison | Two audibly distinct realizations; narration stays English |
| es normal | Spanish realization without switching following English narration to Spanish |
| Learner asks to repeat | Preserve each pronunciation, without reading IPA/phonetic instructions aloud |
| Discovery question | Ask what changed without explaining stress/vowel placement first |
| Later steps and resume | Preserve source order, no repeated intro or skipped question |

An English/Spanish speaker must listen and confirm both examples are suitable teaching models. Caption text, append ACKs, playback RMS, model coverage ratings and the 301 automated backend tests cannot certify phonetic correctness. No live-model test was possible without a project API key in this workspace.

If native output still collapses the contrast, stop escalating text prompts. Use short, human-reviewed audio examples at pronunciation-critical moments, with explicit coordination of the native model's output and application playback. Live conversation can remain native speech-to-speech. That fallback requires verified recordings and separate integration/acceptance; it is not implemented in this change.

Official sources:
- https://developers.openai.com/api/docs/guides/live-prompting#language-and-pronunciation
- https://developers.openai.com/api/docs/guides/live-conversations#control-playback-when-needed
