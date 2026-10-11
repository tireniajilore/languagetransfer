# Live Tutor Evaluation Report

Generated: 2026-10-11T17:36:09.099Z · git: `473e3fd` · hermetic (no OpenAI calls)

## Summary

| suite | passed | failed | pass rate |
|-------|--------|--------|-----------|
| Durable checkpoint ownership and CAS | 2 | 0 | 100.0% |
| Source fidelity and conductor invariants | 5 | 0 | 100.0% |
| Supervised Lesson 2 orchestration (mock model and audio boundaries) | 11 | 0 | 100.0% |
| Guardrail deterministic checks (evaluated control) | 8 | 0 | 100.0% |
| Pedagogical evals (simulated learners, Spanish material) | 12 | 0 | 100.0% |
| Teaching scenarios (brief §11, 15 automated cases) | 15 | 0 | 100.0% |
| **total** | **53** | **0** | **100.0%** |

## Durable checkpoint ownership and CAS

File: `src/lessons/__tests__/checkpointStore.test.ts`

- ✅ persists verified delivery and rejects stale/foreign owners across instances
- ✅ persists verified delivery and rejects stale/foreign owners across instances

## Source fidelity and conductor invariants

File: `src/lessons/__tests__/conductor.test.ts`

- ✅ every step cites an exact span of the unchanged original transcript
- ✅ restores stress discovery and omitted examples without a synthetic outro
- ✅ does not satisfy explanations on authorization or observations without playback
- ✅ rejects stale, fabricated and acknowledgment-based understanding evidence
- ✅ cannot complete a checkpoint with missing receipts or an unverified final step

## Supervised Lesson 2 orchestration (mock model and audio boundaries)

File: `src/lessons/__tests__/sessionManager.test.ts`

- ✅ starts with actual material, no assessment targets in voice context or response.create
- ✅ authorization and acknowledgment never count as delivered; playback alone is insufficient
- ✅ finishes every source step with observed delivery and understanding, then unlocks 3
- ✅ holds the question on okay and does not assess user speech until the turn settles
- ✅ never advances for drift and retries the same step
- ✅ resumes from last verified step, replaying interrupted output
- ✅ terminates when control is lost and rejects concurrent learner sessions
- ✅ does not commit an assessment when further learner speech arrives while it is pending
- ✅ bounds silent-teacher retries and never uses silence to advance a learner question
- ✅ retains an explicit pause across reconnect and waits for resume
- ✅ orders fragments on the session timeline and ignores duplicate events

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

Native audio / real-model acceptance is pending. Mocked audio boundaries do not establish live teaching quality. Use `/live/2?eval=1` to record and export a test conversation.

The legacy generic-harness suites below remain regression coverage; Lesson 2 uses its source-linked conductor and supervisor instead.

## Legacy harness latency / enforcement trade-off status (ADR-001 D4)

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
