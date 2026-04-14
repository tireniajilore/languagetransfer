# I Built an Interactive Spanish App in a Weekend

## The idea

Language Transfer is a free audio course, 90 lessons of a teacher walking you through Spanish by showing you patterns. "Important" becomes *importante*. "Naturally" becomes *naturalmente*. You build real sentences from lesson 1.

The original course is a podcast. You hear the prompt, you hear the student answer, you hear the teacher confirm. Passive listening.

My thesis: what if it were interactive? You hear the prompt, *you* say the answer, then you hear the reveal. Active recall instead of passive listening.

## Day 1: The lesson engine

Started with Next.js and a single hand-crafted lesson (lesson 2, the first real teaching lesson). The lesson engine steps through a sequence of turns: tutor speaks, student responds, tutor gives feedback and the next prompt.

The lesson data is JSON. Each turn has a speaker, text, and flags like `is_prompt` and `is_feedback`. Student turns have `expected_answers`. The engine doesn't grade pronunciation (yet), it just gives you time to speak, then reveals the answer.

## The TTS problem

The app needs two voices in the same sentence. "How would you say *importante*?" is English with one Spanish word. Browser speech synthesis can do one language at a time, and it sounds robotic.

I went with ElevenLabs. Each tutor line gets split into segments: `{ text: "How would you say", lang: "en" }` then `{ text: "importante", lang: "es" }`. Each segment gets its own TTS call with the right language settings.

Getting the pronunciation right took iteration. Tried hidden context to hint at Spanish pronunciation. Tried pronunciation overrides. Ended up with the segment approach, which was the cleanest: just tell the API exactly what language each chunk is, and let it handle the rest.

## The result

By end of day 2, I had one polished interactive Spanish lesson running locally. A tutor that speaks in natural English, switches to Spanish pronunciation for the target words, pauses for you to respond, and moves on. It felt like a real lesson.

One lesson. Eighty-nine to go.
