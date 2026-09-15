# Move spec format — worked example

The 32 moves in `lt-act-taxonomy-lesson-04.md` are currently names with one example each.
That is not enough to drive a model. Testing showed what a spec actually needs.

## What the testing established

| finding | consequence for the format |
|---|---|
| A move name alone gets ~4/6 compliance | needs more than a label |
| Adding explicit "what NOT to say" raised it | every spec needs a **prohibition**, not just an instruction |
| A global "say the Spanish" rule broke the withhold move 4/6 → 0/3 | every spec carries its **own language rule** |
| Docs: "the model strongly closely follows sample phrases" | every spec carries **real Mihalis lines**, not paraphrases |
| Curriculum leaks happen regardless of prompt | specs cannot be trusted alone; a **check** runs after |

## The format

```
MOVE: <plain English name>
WHEN:        the situation that triggers it
DO:          what the tutor does
DO NOT:      the specific failure this move invites
LANGUAGE:    SAY THE SPANISH / SAY NO SPANISH THIS TURN
EXAMPLES:    2-3 verbatim lines from the transcripts
CHECK:       deterministic post-check, where one exists
```

---

## Worked example: the move that fails most

```
MOVE: Give the route back, not the answer

WHEN
  The learner is stuck or silent on something they have already been given.
  Not for new material. Not after a wrong answer (that is "name where the
  mistake came from").

DO
  Name the SOURCE they should look at. The phrase it came from, the rule that
  generates it, or the English word it is related to. Then stop and hand the
  turn back, ideally with a question.

DO NOT
  Do not say the answer word on its own. Do not say it "together" with them.
  Do not complete the extraction for them. The learner does the last step.
  (Saying a phrase that CONTAINS the answer, like "te quiero", is correct and
  is the whole point. Saying "quiero" alone is the failure.)

LANGUAGE
  SAY NO SPANISH THIS TURN, except when naming the source phrase itself.

EXAMPLES (verbatim, from the transcripts)
  "Do you remember how to say 'I have' from haber? We can look at the two
   vowels we have in haber and this will set us off."
  "And what was 'to dance', related to ballerina?"
  "What was that related to? What was that about? And see what pops up."

  Note what all three share: he names the source, then stops. The third is him
  teaching the retrieval strategy itself, not just this one answer.

CHECK
  The answer string is in `expected_answers`. Scan the generated line; if the
  answer appears outside a known taught phrase, regenerate or fall back.
```

---

## Does the few-shot actually help? Partly.

Tested `gpt-audio`, N=8 per condition, same context, temperature 0.8.

| condition | held the answer back |
|---|---|
| A: description + prohibition only | 6/8 |
| B: same + three verbatim Mihalis examples | 7/8 |

**On leak rate, that difference is noise at N=8.** Do not claim few-shot fixes compliance.

**On form, the difference is visible.** Every B output ends by handing the turn back
with a question:

> "What did we pull out?" · "What was that piece we pulled from *te quiero*?"

Most A outputs end with a statement:

> "That's how you found it." · "Just go back to that."

All three source examples end in a question, and the model copied that. So few-shot
buys the **shape** of the move, not its reliability.

Reliability comes from the CHECK line. Those are complementary, and you need both.

---

## Cost of authoring all 32

Per move: roughly a paragraph, plus finding 2-3 real examples in the transcripts.
Grep gets you candidates in seconds; picking the good ones is the judgment part
and it is yours.

**Do not write all 32 first.** The distribution says four moves are 61% of a lesson,
and those four (ask, say "Good", repeat back, say it properly) are nearly
specification-free — they are triggered mechanically and have no interesting
prohibition. The specs that earn their authoring time are the judgment moves.

Suggested order:
1. Give the route back, not the answer — done above, and the one that fails most
2. Name where the mistake came from
3. Send them back to the method
4. Praise the thinking, not the answer
5. Break a phrase to pull out a piece
6. Ask for something never taught

Six specs covers every move where the model can go wrong in an interesting way.
The rest are either mechanical or rare enough to defer.
