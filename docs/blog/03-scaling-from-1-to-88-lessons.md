# Scaling from 1 Lesson to 88 with a PDF Parser and GPT-4o

## The content bottleneck

Lesson 2 took two days to hand-craft. The lesson JSON, the speech segments, the TTS generation, the pacing tweaks. At that rate, 90 lessons would take six months.

Then I found the PDF.

The Language Transfer Complete Spanish transcript. 508 pages, 90 tracks, with **bold formatting on Spanish words**. Bold = Spanish, non-bold = English. This meant I could parse the PDF and auto-generate lesson data.

## The pipeline

Built a three-stage pipeline:

**Stage 1: PDF Parser.** `pdftohtml -xml` converts the PDF to structured XML with font metadata. Font 9 (bold blue) = track headers. Font 10 (bold) = Spanish text. Font 0 (regular) = English narration. Speaker labels: "Teacher:"/"T:", "Student:"/"S:". The parser groups text by page position, detects speakers, classifies language by font, and outputs lesson JSON files.

Parsed 88 lessons. Track 1 (intro) and track 25 (missing from PDF) skipped. Each lesson gets a `lesson-NN.json` with turns and a `lesson-NN-segments.json` mapping each turn to its English/Spanish speech segments.

**Stage 2: LLM Refinement.** The raw parser output has artifacts. Run breaks mid-sentence, speaker labels in weird places, formatting noise. Built a GPT-4o refinement script that sends each parsed lesson with lesson 2 as the gold standard reference. "Fix parsing artifacts, improve scaffolding, tighten pacing." Refined 24 lessons at about $0.10 each.

**Stage 3: Segment Generation.** After refinement changes turn counts, the old PDF-based segments are misaligned. Built a heuristic segment generator: collect Spanish phrases from `expected_answers` fields, find them in the tutor text via word boundary matching, split each line into `en`/`es` segments.

**End result:** 88 lessons parsed, 24 refined via LLM, all with speech segments. Ran TTS generation for lessons 3-24. About $22 in ElevenLabs credits. Four hours of generation time.

## The mistake

I generated audio before reviewing the scripts.

The ElevenLabs audio for 22 lessons was burned. When I went back to actually read the lessons, lesson 3 needed significant edits. All that audio was wasted.

**New rule: finalize the script before generating audio.** The fallback chain means every lesson is playable with browser speech synthesis. Edit the JSON, test with the browser voice, only generate ElevenLabs audio after you've confirmed the script is right. Credits are expensive. Robot voice is free.
