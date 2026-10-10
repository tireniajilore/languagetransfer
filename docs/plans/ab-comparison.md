# A/B Comparison: Scripted Player vs Live Tutor

**Status:** design only (PR 5). The brief §11 asks for a real-learner
comparison of the new live tutor against the existing scripted experience.
This doc specifies what to measure, the protocol, and what the system
already collects to support it. Do not run this until the live tutor has
real latency numbers (`docs/plans/live-latency-procedure.md`) and at least
the Spanish v1 curriculum is teachable end to end.

## Why

The eval suites (`docs/evals/latest.md`) measure the harness against
simulated learners. They cannot tell us whether the live tutor *teaches
better* than the scripted player. Only a controlled comparison with real
learners can. Engagement alone is not the metric — the brief is explicit:
do not equate high engagement with effective learning.

## Arms

- **Control:** the existing scripted lesson player (unchanged product,
  same curriculum content).
- **Treatment:** the live tutor (`/live`), same starting objective and
  curriculum version.

Both arms teach the same objectives from the same curriculum so content is
held constant; the variable is the teaching *interaction* (adaptive voice vs
scripted playback).

## What to measure (primary → secondary)

1. **Independent transfer performance** (primary). After the lesson, the
   learner faces unfamiliar examples requiring the same pattern
   (harness `test_transfer` moves are the in-lesson version; the
   post-lesson probe is new). Score: proportion correct without hints.
2. **Retention after a delay.** Same probe 48h later (email/session reminder;
   needs learner identity — the `learnerId` the harness already accepts).
3. **Time to understanding.** Wall-clock from objective start to the
   evidence-gated `advance_objective` commit.
4. **Learner-reported clarity and confidence.** 1–5 Likert after each
   objective: "I could explain this to someone else."
5. **Engagement and completion** (secondary, reported but not decisive):
   session completion rate, voluntary continuations.

## Protocol

- **Randomization:** learners randomized to arm at first session (stratify by
  self-reported Spanish level: none / some / rusty).
- **Blinding:** learners know they're trying "two lesson formats"; they are
  not told which is hypothesized better.
- **Sample:** start with n=20/arm as a pilot; size the full study from the
  pilot's transfer-performance variance (power 0.8, α 0.05).
- **Curriculum freeze:** both arms run the same curriculum version for the
  study duration. No deploys to the teaching path mid-study.
- **Analysis:** primary = transfer score difference (two-sample t-test or
  Mann-Whitney if skewed); report effect size, not just p-values. Secondary
  metrics descriptive. Pre-register the analysis before the full study.

## Data the system already collects

| measure | source |
|---|---|
| transfer performance (in-lesson) | `record_learning_evidence` with `kind: 'transfer_pass'` / `transfer_fail` (harness store → Postgres) |
| time to understanding | session created → `advance_objective` commit timestamps (tool dispatch logs carry `sessionId`, `turnId`, `durationMs`) |
| completion | `sessions.created/closed` counters, `/metrics` |
| misconception encounters | `record_learning_evidence` misconception records; guardrail trigger logs |
| hints needed | hint-escalation evidence per concept |

**Gaps to close before the study:** the post-lesson transfer probe and the
48h retention probe don't exist yet (needs a small quiz UI + reminder);
self-reported clarity needs a one-question prompt at objective completion.
Learner identity must be consistently passed as `learnerId` (currently
optional).

## Guardrails for the study itself

- Stop early if the live tutor shows *worse* transfer performance than
  control with p < 0.05 at the pilot (futility).
- Log every guardrail trigger during the study; a high trigger rate in the
  treatment arm is a finding, not noise.
- Don't change the voice model's instructions mid-study.
