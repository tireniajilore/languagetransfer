# Voice model findings — what we tested and what held

2026-09-12. All tests against OpenAI models using the Lesson 4 curriculum state
(te quiero → quiero, "no" negation, -ión/-ción rule, -ción → -ar rule, "me").
Scripts in scratchpad: `move-vs-nomove.mjs`, `voice-move-test.mjs`, `headtohead.mjs`,
`spanish-when-needed.mjs`, `act-latency-probe.mjs`. Audio samples in `tmp/voice-test/`.

Small N throughout (3-6 runs per condition). These establish direction and catch
disqualifying failures; they are not production SLOs.

---

## 1. Giving the model a "move" changes what it does

Same model, same context, same temperature. Only difference: whether the system hands it
a named teaching move.

Case: learner says nothing when asked "what was 'I want' again?"

**No move given** — all three runs gave away the answer. Two leaked untaught material:
one invented the verb `querer`, another taught "the verb root plus -o at the end", which
is conjugation several lessons early. Both leaks sound fluent and warm.

**Move given** ("give the route back, not the answer") — three of three withheld the
answer and used the taught `te quiero` decomposition.

Also observed without moves: flat verdicts ("'Confirmacionar' is not a word") and
flow-breaking permission requests ("Would you like to try another verb?"), which is the
click-to-proceed problem identified in June re-emerging on its own.

**Boundary:** when the right move is obvious (a straightforward pronunciation correction),
no-move output was nearly identical. Moves matter for ambiguous moments and where there is
a temptation to over-explain.

---

## 2. Speech-out models are NOT less steerable than text models

An earlier conclusion that they were was wrong: an artifact of a vague prompt and N=3.

With a properly specified move and a language pin, 6 runs each:

| model | held the answer back | answered in Spanish | median latency |
|---|---|---|---|
| `gpt-4.1-mini` (text out) | 2/6 | 0/6 | **1077ms** |
| `gpt-audio` (speech out) | **4/6** | 0/6 | 2967ms |
| `gpt-audio-mini` (speech out) | 0/6 | 0/6 | 2283ms |

The speech model beat the text model. **Modality is not the variable. Model size and
prompt specificity are.**

---

## 3. Mini models are disqualified

`gpt-audio-mini` held the answer 0/6 and invents Spanish grammar:

> "we form it from 'quiero' by taking the sound of wanting"
> "think of the word for 'I' in Spanish, then keep that base and add the next piece"

The second is factually wrong and contradicts the exact lesson being taught (the point of
Lesson 4 is that `quiero` carries "I" without a separate word). Do not use mini models for
the teaching turn at any latency saving.

---

## 4. Language drift is real and fully fixable

Before any language rule: **4 of 12** audio runs answered a beginner entirely in Spanish,
including one that taught verb roots and conjugation endings in Spanish to a Lesson 4
learner. Fluent, warm, and useless.

After adding an explicit language pin: **0 of 18**, across all three models.

This matches OpenAI's documented guidance. The
[Realtime Prompting Guide](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)
says to "pin output to a target language if you see unwanted language switching," with the
example "Do not respond in any other language even if the user asks."

---

## 5. The Spanish carve-out works — 12/12

The obvious risk of an English pin is suppressing the Spanish the tutor must say. It did not.

| move | says the required Spanish | sample |
|---|---|---|
| echo their correct answer | 3/3 | "Well done! *Quiero cancelar.* Now, how would you say 'I want to confirm'?" |
| model it for their ear | 3/3 | "Let's say it together: *quiero preparar*." |
| teach a new word | 3/3 | "The word for 'me' in Spanish is *me*, pronounced just as it's written." |
| reveal the answer | 3/3 | "*No quiero cancelar.* That means 'I don't want to cancel.'" |

**Spanish pronunciation quality confirmed good by the domain expert** (listened to
`tmp/voice-test/`, `gpt-audio` with voice `alloy`). This was the last open risk that would
have forced a composed-stored-audio fallback for the Spanish. It does not.

---

## 6. Language rules must be PER-MOVE, not global

Adding "YOU MUST STILL SAY THE SPANISH WORDS OUT LOUD" fixed the required-Spanish cases and
**broke the withhold move: 4/6 → 0/3.**

> "Remember, we said 'I want' is **'quiero'**. Can you say that again out loud: **'quiero'**?"

The two instructions fight and the louder one wins. So each move ships with its own
language constraint:

- echo / model / reveal / teach → **"SAY THE SPANISH CLEARLY."**
- route back / ask them to remember → **"SAY NO SPANISH THIS TURN."**

This fits the architecture: the act-selection layer already knows which move it is
dispatching, so the move and its language rule travel together.

---

## 7. Prompting alone will not make compliance reliable

Best observed compliance on the withhold move is 4/6, and it swings run to run (3/3 on one
sample, 1/3 on the next with an identical prompt). The docs explain why: realtime models are
"incredibly sensitive to precise wording in ways that most text models aren't" and "small
wording changes can make or break behavior."

Two fixes, both worth doing:

**Few-shot the move with real examples.** The guide states the model "strongly closely
follows sample phrases" and that concrete examples override abstract instructions. There are
90 transcripts of the real thing. Every move in the taxonomy should carry 2-3 verbatim
Mihalis lines as few-shot, not just a description.

**Deterministic post-check.** `expected_answers` is already in the lesson data. For withhold
moves, scan the generated line for the answer string before speaking. If it leaked,
regenerate or fall back to a stored clip. Free, instant, turns 4/6 into effectively 6/6.

---

## 8. Curriculum leaks persist regardless of modality

Seen across both text and audio, even with good prompts:

- `querer` introduced as a verb (never taught)
- "the verb root plus -o at the end" (conjugation, several lessons early)
- "the '-ar' infinitive… but now in the 'yo' form" (same)
- "that's the same as in *me gusta*" (`gustar` nowhere near taught)

**The Layer 1 inventory check is not optional.** No amount of prompting removes this.

One borderline case worth a ruling: the model invented the prompt "how would you say
'I want to examine'?" using `examinar`, which was not in the taught verb list but *is*
derivable via the -ción rule. Under the derivability rule that is legal, and arguably a
good inference prompt the model generated on its own. Decide whether this counts as a leak
or a feature.

---

## 9. Latency

| step | measured |
|---|---|
| act selection (text, closed set of 32) | 730ms warm p50 (`gpt-4.1-mini`) |
| utterance generation, speech out | 2.3-3.0s (`gpt-audio`) |
| utterance generation, text out | ~1.1s (`gpt-4.1-mini`) |

Act selection floors around 600-830ms; `gpt-4.1-nano` hits 596ms and returns nonsense on
half the cases, so latency cannot be bought with a smaller model.

**Hiding it:** affirmation clips already on disk run 560-790ms
(`lt-runner/public/audio/`). The rules layer fires the affirmation instantly from disk while
act selection runs concurrently. The ladder macro (noun → verb → sentence) runs three
elicits with no model call at all.

Speech-out generation at 2.3-3.0s is the remaining real cost and is not yet hidden.

---

## Where this leaves the architecture

Confirmed:
- Three layers work. Moves control strategy without fixing the words.
- Speech out is viable: steerable, and the Spanish sounds right.
- Use `gpt-audio` class, never mini.
- Language pin per move, not globally.

Still needed:
- Few-shot examples per move, mined from the transcripts.
- Layer 1 inventory check with derivability.
- Deterministic answer-leak check on withhold moves.
- A plan for the 2.3-3.0s speech generation latency.

**Next concrete step:** turn the 32 moves from names into operational specs. Each move needs
its behavioural instruction written explicitly (what to do AND what not to say), its language
rule, and 2-3 verbatim Mihalis examples. That artifact is what makes the whole thing work,
and it is authored, reviewable, and entirely yours.
