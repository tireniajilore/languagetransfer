# Live Tutor Evaluation Report

Generated: 2026-10-10T18:18:03.318Z · git: `72e1cc7` · hermetic (no OpenAI calls)

## Summary

| suite | passed | failed | pass rate |
|-------|--------|--------|-----------|
| Guardrail deterministic checks (evaluated control) | 8 | 0 | 100.0% |
| Pedagogical evals (simulated learners, Spanish material) | 12 | 0 | 100.0% |
| Teaching scenarios (brief §11, 15 automated cases) | 15 | 0 | 100.0% |
| **total** | **35** | **0** | **100.0%** |

## Guardrail deterministic checks (evaluated control)

File: `src/reasoning/__tests__/guardrails.test.ts`

- ✅ triggers on an answer leak and sends a corrective instruction
- ✅ does not trigger once the answer has been legitimately revealed
- ✅ does not trigger on ordinary teaching speech
- ✅ triggers when the assistant teaches an unintroduced concept
- ✅ does not flag the concept currently being taught
- ✅ ignores user turns
- ✅ flush checks a buffered turn on session close
- ✅ clearLiveTargets stops leak detection for that concept

## Pedagogical evals (simulated learners, Spanish material)

File: `src/reasoning/evals/pedagogical.test.ts`

- ✅ every referenced misconception exists in the curriculum
- ✅ every referenced concept exists in the curriculum
- ✅ pq-01: Clean correct answer on the copula: test transfer, do not assume mastery.
- ✅ pq-02: Hesitant but correct: ignorable words must not penalize.
- ✅ pq-03: Registered misconception: inserting "a" between quiero and the infinitive.
- ✅ pq-04: Registered misconception: conjugating the second verb.
- ✅ pq-05: Unfamiliar wrong answer: escalate to delegated reasoning, do not guess.
- ✅ pq-06: Off-task speech: stay silent, record nothing assessable.
- ✅ pq-07: Added negation flips meaning: a real wrong attempt, not noise.
- ✅ pq-08: Repeated struggle then repair: incorrect x2, then correct.
- ✅ pq-09: Short-target robustness: "esta" for "es" is an attempt, not noise.
- ✅ pq-10: Emphatic pronoun form is correct Spanish, not an error.

## Teaching scenarios (brief §11, 15 automated cases)

File: `src/reasoning/evals/scenarios.test.ts`

- ✅ 1. correct with demonstrated understanding: transfer suggested, mastery not granted
- ✅ 2. correct without demonstrated understanding: probe before advancing
- ✅ 3. plausible misconception: flagged with authored diagnosis on the fast path
- ✅ 4. unexpected incorrect: escalates to delegated reasoning
- ✅ 5. unclear/mis-transcribed speech: silence, no correction, no moves
- ✅ 6. extended silence: no evidence fabricated from nothing
- ✅ 7. interruption mid-delegation: redelivered events are idempotent
- ✅ 8. request for the answer: no premature reveal without justification
- ✅ 9. attempt to skip prerequisites: locked concept stays locked
- ✅ 10. previously mastered concept: reinforce/transfer, never re-introduce
- ✅ 11. repeated mistakes: struggling status and hint escalation
- ✅ 12. tool failure: structured error, session continues
- ✅ 13. session interruption and recovery: buffered turn flushed, state marked
- ✅ 14. duplicate and out-of-order events: evidence never double-counts
- ✅ 15. stale delegated decision: rejected, never applied

## Latency / enforcement trade-off status (ADR-001 D4)

- **Hard controls** (enforced in code): objective gating, prerequisite locking,
  transition validation, idempotent tool commits — covered by state-machine and
  tool-contract tests above. Enforced, not prompted.
- **Soft controls** (model instructions): teaching tone, guided-discovery
  preference, no premature answers — delivered via `session.instructions` and
  `session.thinking` context. Prompted, not enforced.
- **Evaluated controls** (measured): the guardrail suite above checks answer
  leakage and teaching-ahead deterministically on the transcript stream;
  pedagogical quality beyond that is measured by the simulated-learner suites.
- **Explicitly NOT implemented**: word-for-word pre-playback gating of spoken
  audio. Revisit only if offline evals show unacceptable leakage — see ADR-001
  D4 for the trigger condition and the documented fallback.

## Latency

- Scripted (mocked boundaries): `npm run bench` — backend-owned paths
  (analysis, tool dispatch, delegation overhead).
- Live speech-end → first-audio: **not yet measured** — requires a real
  browser voice session. Follow `docs/plans/live-latency-procedure.md`.
  Target: <1s for routine responses (brief §9).

## Honest limitations of this report

- Learners are simulated, not real. Persona coverage is only as good as the
  dataset; emergent real-learner behavior is out of scope here.
- No live end-to-end verification: nothing here proves the voice loop works
  against real GPT-Live sessions.
- Guardrail checks are deterministic string rules; subtle unsupported claims
  beyond answer-leak/teaching-ahead are measured by the pedagogical suite,
  not blocked.
