# Act-selection latency budget — measured

Measured 2026-09-12. Probe: `act-latency-probe.mjs` (scratchpad).
Task: given a curriculum inventory slice plus the last exchange, choose one act from the
32-act closed set derived in `lt-act-taxonomy-lesson-04.md`. Output is a single label,
`max_completion_tokens: 8`, `temperature: 0`. Six cases: one correct answer, four error
types, one silence. Two passes (cold, then warm connection).

## Results

| Model | cold p50 | warm p50 | warm min | warm max | act quality |
|---|---|---|---|---|---|
| `gpt-4o-mini` | 1125ms | **828ms** | 609ms | 1199ms | all six sensible |
| `gpt-4.1-mini` | 793ms | **730ms** | 608ms | 834ms | all six sensible |
| `gpt-4.1-nano` | 1027ms | **596ms** | 520ms | 1088ms | **three of six wrong** |

## The headline: you cannot buy latency with a smaller model

`gpt-4.1-nano` is 134ms faster than `gpt-4.1-mini` and returns `RECALL_PROMPT` for a
regularised verb form, for an English pronunciation leak, and for silence. Those are
nonsense selections. It is not doing the task.

**The floor for competent act selection is roughly 600 to 830ms.** My estimate in the
design doc was "around half a second." That was optimistic by a third.

One quality note in the other direction: for the English-leak case (*"Generay-shun"*),
`gpt-4.1-mini` chose `PRONUNCIATION_NOTE` where `gpt-4o-mini` chose `DIAGNOSE_ERROR`.
The former is arguably the better teaching move. Act quality is not strictly ordered by
model size.

## Why 730ms nearly breaks the naive design

Serial turn budget, if act selection gates generation:

```
learner stops speaking
  → audio reaches model            200-400ms
  → act selection                  730ms
  → utterance generation + TTS     300-800ms
  ────────────────────────────────────────
  total                            1.2 - 1.9s
```

That is past conversational and into "did it freeze." Human turn-taking gaps run about
200ms for reflex answers and 600-1500ms when the responder is genuinely evaluating, so
730ms *by itself* is fine and arguably correct for a teacher weighing your Spanish. It
is the stacking that fails.

## The fix, and it falls out of the act distribution

The head four acts (`ELICIT`, `AFFIRM`, `ECHO`, `MODEL`) are **61% of all act instances**
and are mechanically determined by ladder position plus correctness. They need no model
call at all.

So the rules layer answers **immediately** with a stored clip, and the model call runs
**during that clip's playback** to decide what comes next.

Measured affirmation clip durations in `lt-runner/public/audio/`:

```
0.557s   lesson-05/turn-5-reveal-2.mp3
0.604s   lesson-24/turn-13-reveal-1.mp3
0.650s   lesson-24/turn-15-reveal-2.mp3
0.789s   lesson-24/turn-19-reveal-1.mp3
```

**An affirmation is 560 to 790ms of audio. Act selection is 730ms warm.** The model
finishes choosing at almost exactly the moment the affirmation stops speaking.

The latency is not reduced. It is hidden inside audio the tutor was going to play anyway.

```
learner stops speaking
  → rules layer fires "Good." from disk        ~0ms     [560-790ms of audio]
  → act selection runs concurrently            730ms
  → next utterance begins                      as the affirmation ends
```

The ladder macro finding compounds this: `noun → verb → sentence` runs three elicits with
no model call, so the most common stretch of a lesson is entirely free.

## What this means for the architecture

1. **Layer 2 is a rules table AND a model call**, and the split is dictated by latency,
   not cost. Rules cover the immediate response; the model chooses what comes next.
2. **Use `gpt-4.1-mini`, not nano.** The 134ms saving costs correctness.
3. **Never let act selection gate the first sound.** If a turn has no valid instant
   response from the rules layer, that is a design bug, not a latency problem to optimise.
4. **This is the load-bearing assumption to re-test** once real turns are wired: the 730ms
   figure came from a synthetic payload. Real inventory slices will be longer, and longer
   prompts cost time.

## Caveat

These are text-completion latencies against a synthetic prompt from one machine on one
network, six cases per model, two passes. They establish an order of magnitude and the
nano-is-fast-and-wrong finding, not a production SLO. A realtime voice path has a
different profile and has not been measured.
