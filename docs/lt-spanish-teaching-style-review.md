# Language Transfer Spanish Teaching Style Review

Created: 2026-06-04

Purpose: improve Yoruba lesson generation by studying all 90 Complete Spanish transcripts as a teaching-style corpus.

Sources:

- `transcripts/Language Transfer - Complete Spanish - Lesson 01.txt` through `Lesson 90.txt`
- `docs/yoruba-lessons-01-04-briefs.md`
- `data/yoruba/lesson-01-script-v4.md` through `lesson-04-script-v1.md`

---

## 1. Corpus Signals

The 90 Spanish transcripts are not just grammar sequencing examples. They are a teaching-behavior corpus.

Rough corpus counts from all 90 transcripts:

| Pattern | Approx count | Signal |
|---|---:|---|
| `How would you say` | 540 | The course is prompt-driven, not explanation-driven. |
| `What was` | 208 | Constant retrieval and rebuilding. |
| `Good` | 2013 | Frequent low-friction affirmation. |
| `Very good` | 184 | Stronger affirmation after harder thinking. |
| `Perfect` | 43 | Used sparingly for satisfying clicks. |
| `think` | 313 | Teacher keeps pulling attention back to process. |
| `remember` | 128 | Memory is discussed, but usually as retrieval-through-hooks, not rote memorization. |
| `you might` | 107 | Teacher anticipates learner thoughts and errors. |
| `rather than` | 33 | Frequent contrast between a bad mental path and a better one. |
| `instead` | 62 | Reframing and structural alternatives. |
| `interesting` | 70 | Functional curiosity; the teacher has taste. |
| `No, no` | 29 | Corrections happen, but usually with process repair. |
| `well done` | 18 | Reserved for effortful constructions. |

Across early, middle, and late samples, the course keeps a high density of questions and feedback. The late course gets more complex, but it does not become a lecture. It remains a live thinking session.

---

## 2. What Our Yoruba Drafts Are Missing

The current Yoruba v4/Lessons 2-4 are structurally cleaner than v3, but the teacher voice is too flat.

Main problems:

1. **Too much clean narration.**
   The teacher says the planned explanation, then asks for the planned answer. It feels composed rather than discovered.

2. **Feedback is generic.**
   We overuse `Good` and `Yes` without saying what was good about the learner's process.

3. **No plausible learner mistakes.**
   The Spanish course gains life because the student sometimes slips, guesses, hesitates, or over-applies a pattern. The teacher then teaches from the mistake.

4. **Not enough thinking guidance.**
   Mihalis often says how to think: block by block, go back to the base form, don't ask "do I know it?", notice what changed, find the hook.

5. **Not enough functional curiosity.**
   Spanish lessons contain little moments of delight: "one of my favorite rules," "this is interesting," "there's a nice wisdom there." These are not decoration. They reset load and make structure memorable.

6. **The teacher lacks a point of view.**
   Mihalis has opinions: don't memorize, don't rush, don't be inhibited by pronunciation, guess vocabulary but don't guess structure, anything you don't control will control you. The Yoruba teacher needs similarly clear teaching principles.

---

## 3. Spanish Transcript Teaching Moves

### A. Process Affirmation

Weak version:

> Good. Mo fẹ́ omi.

Better LT version:

> Good. You kept the frame still and only changed the ending. That's the whole trick here.

The teacher should affirm the mental move, not only the answer.

### B. Diagnostic Correction

Weak version:

> No. Try again.

Better LT version:

> Almost. You brought in the English "to" because English is shouting at you there. Go back to the Yoruba frame: `Mo fẹ́`, then the action.

Corrections should name the source of the error and return the learner to a reliable process.

### C. Plausible Error Branches

Because we may not have a live volunteer student, generated scripts should include scripted plausible wrong turns.

Example:

```md
**Teacher:** How would you say "I want to go"?

*[pause]*

**Possible learner mistake:** Mo fẹ́ to lọ.

**Teacher:** If you felt a little English "to" trying to sneak in there, good, notice it. English needs it. Yoruba doesn't here. Keep the frame: Mo fẹ́ lọ.
```

For final audio, this can be performed as teacher-side preventative correction even if no student voice is present.

### D. Functional Asides

Good asides do one of three jobs:

- reset cognitive load,
- create a memory hook,
- increase language consciousness.

Bad asides merely entertain or add facts.

For Yoruba, good early asides might be:

- "English uses pitch mostly for attitude. Yoruba can use it for the word itself."
- "Don't slide into a melody. Hold the note like humming."
- "English says `to` so often that it feels like grammar itself. Here it is just English noise."

### E. Shared Investigation

The Spanish teacher often uses `we`: "we can see," "we want to," "we don't want to," "we have a shortcut."

Yoruba generation should avoid sounding like a lecturer:

- Prefer: "Let's see what changed."
- Prefer: "We don't want to carry English across there."
- Prefer: "We can use this as a hook later."
- Avoid: "The rule is..."

### F. Thinking Before Answering

The teacher should often cue the learner to slow down before a prompt:

- "Take it in two pieces."
- "Don't reach for memory. Rebuild it."
- "First find the frame. Then add the ending."
- "Listen to the voice before you answer."
- "If English gives you an extra word, ask whether Yoruba actually asked for it."

### G. Micro-Recaps

Mihalis recaps constantly, but briefly. Recaps are not summaries at the end only; they appear before and after difficult prompts.

Pattern:

1. "What was X?"
2. learner answers
3. "Good. And what did that tell us?"
4. new prompt

### H. Delight Without Performance

The teacher should have small moments of taste:

- "This is a gift."
- "This is the useful bit."
- "That's the little trap."
- "Good, that's the language getting lighter."

But avoid over-written inspirational lines. The warmth should come from attention.

---

## 4. New Generation Rules

Every generated lesson should now include these fields before scripting:

1. **Teacher stance**
   What does the teacher believe the learner is learning about thinking, not just Yoruba?

2. **Likely learner errors**
   At least three plausible wrong moves for the main atom.

3. **Correction scripts**
   For each likely error, write a gentle diagnostic correction.

4. **Process affirmations**
   At least five places where feedback names the mental move.

5. **Functional aside**
   One short aside that resets load or creates a hook.

6. **Prompt variety**
   Mix `How would you say`, `What was`, `What changed`, `What stayed still`, `Build it in two pieces`, and `Listen first`.

7. **Micro-recap beats**
   Every 3-5 prompts, briefly rebuild the frame.

8. **Teacher personality check**
   The teacher should sound curious, exact, warm, slightly opinionated, and live. If the script could be read by a generic app narrator, it fails.

---

## 5. Yoruba-Specific Teacher Voice

The Yoruba teacher should not imitate Spanish-specific moves like cognate conversion. It should imitate the teaching behaviors.

Good Yoruba teacher qualities:

- precise about sound without visual notation,
- protective about respect/register,
- honest about what is being delayed,
- encouraging but not sentimental,
- curious about how English interferes,
- able to say "we are not going to touch that yet" with confidence.

Sample improved teacher lines:

| Flat draft | Better teaching voice |
|---|---|
| `Good. Mo fẹ́ omi.` | `Good. You kept Mo fẹ́ untouched and only changed the last piece. That's the habit we want.` |
| `Yoruba does not need that English to here.` | `English is going to try to donate a little "to" here. Don't accept the gift. Yoruba didn't ask for it.` |
| `The word for sleep is sùn.` | `Listen before you say this one. Let your voice sit low and stay there: sùn.` |
| `O is you.` | `This is a familiar "you." Useful, but not for everyone in the family. Yoruba cares about respect, and we will give you that tool soon.` |
| `Fẹ́ stayed the same.` | `That's the win: you changed the person and the verb didn't flinch.` |

---

## 6. Revised Prompt Template for Lesson Generation

Use this prompt shape when generating a lesson script:

```md
Write a Language Transfer-style Yoruba audio lesson from this brief.

Constraints:
- Audio only. No spelling/diacritic talk to the learner.
- One main atom only.
- Include frequent prompts with pauses.
- After every learner answer, immediately repeat the correct target answer before explanation or the next prompt.
- Do not merely narrate. Teach through the learner's thinking.
- Add likely learner mistakes and teacher-side preventative corrections.
- Feedback must often affirm the process, not just the answer.
- Include one functional aside that either resets load, creates a hook, or raises language consciousness.
- Keep the teacher warm, exact, curious, and slightly opinionated.
- The teacher should sound live, not like an app narrator.

For each script section, include:
- goal of the section,
- teacher lines,
- expected learner answer,
- optional likely error and correction if relevant.

End with:
- structures introduced,
- structures delayed,
- native-review questions.
```

---

## 7. What To Do Next

Rewrite Lessons 1-4 with this stronger teacher model before sending to a native reviewer.

The grammar sequence is good enough to test. The teaching voice is not yet good enough. The next draft should preserve the cleaned-up atom sequence but add:

- process affirmations,
- anticipated errors,
- functional asides,
- more varied prompt language,
- less sterile `Good. Yes.` repetition,
- a teacher who sounds like they are actively thinking with the learner.

This should happen before rater review, because a native reviewer can judge grammar and naturalness but may not repair the LT teaching personality for us.
