# Supervised Live teaching implementation and acceptance

The design is implemented for Complete Spanish Lesson 2. The source-audited specification has 59 required steps, including stress discoveries and the cognates missing from the old JSON. It removes the synthetic outro that was not present in the transcript. The original recording still needs a human content review: the checked-in transcription contains obvious recognition errors, documented in the specification.

## Authority and persistence

`supervisedConductor.ts` separates authorization, command acknowledgment, generated speech, playback-boundary observation, and understanding. Only satisfied steps contribute to progress. Supervisor proposals are bound to the immutable specification digest, active step, and state version. Evidence must quote the learner's actual text. Acknowledgments never satisfy a discovery. Pronunciation is not inferred from a text match.

`teaching_checkpoints` replaces the old authorization-based cursor for unlocking. Existing legacy progress is preserved in its original table but does not unlock lessons; uncertain old progress must be repeated. Saves use an atomic revision check and a 45-second session ownership lease, renewed every ten seconds. A second active tab is refused. Expired owners cannot save. Checkpoints persist source IDs, generated teacher text, directive IDs, delivery receipts, learner observations, hints and assessment summaries.

Lesson 3 unlocks after all 59 required steps, including the final explanation. Teaching later lessons remains disabled until their specifications are reviewed and the Lesson 2 audio acceptance suite passes. The course distinguishes eligibility from rollout readiness.

## Live protocol and limitations

Native WebRTC speech-to-speech is retained. Lesson sessions use application-owned client delegation inside the session configuration. All context appends have event IDs, nullable delegation IDs and conservative per-append content limits. `response.create` is not used to start or continue spoken teaching.

Each speaker's fragments are assembled independently, ordered by the Live timeline, and deduplicated by event ID. There is no native turn-final event. A 1.5-second quiet interval schedules learner analysis, with browser microphone activity and the active question's rubric as additional checks. Late fragments invalidate in-flight decisions. Quiet time is a heuristic, not proof of a complete utterance.

Generated speech must cover the authorized passage and have a matching browser playback-boundary observation before it satisfies delivery. Browser RMS activity, an unpaused/unmuted player, and the latest output event provide conservative evidence of audio activity; **they do not establish sample-accurate delivery, that a human listened, or phonetic correctness**. Ambiguous or interrupted output is repeated. Direct WebRTC audio is not buffered or checked before playback; drift detection remains reactive. Supervisor coverage grading is evaluated control, not a hard guarantee.

A state-aware watchdog retries a pending undelivered directive at most twice, then pauses. Waiting for a learner and explicit pauses are not stalls. Control loss terminates the call; a new session replays the last unverified step. A missing browser heartbeat terminates orphaned sessions after 30 seconds. Model failures never authorize advancement. A paused checkpoint remains paused on reconnect.

## Automated checks

The suites exercise source-span integrity, complete Lesson 2 progression, stale/invalid decisions, acknowledgments, mic activity, interrupted delivery, drift recovery, ownership, Postgres persistence, old-cursor isolation, duplicate start, transport command shapes, and authenticated API access. Models, WebRTC, and playback boundaries are mocked. These checks do not establish live model quality or the proposed P95 latency targets.

Run from the repository:

```sh
npm run typecheck --prefix live-backend
npm run lint --prefix live-backend
npm test --prefix live-backend
npm run build --prefix live-backend
npm run typecheck --prefix lt-runner
npm test --prefix lt-runner
npm run build --prefix lt-runner
npm run eval:report --prefix live-backend
```

## Audio-native acceptance procedure

Deploy backend and frontend together in a test environment; migration 0003 runs on backend startup. Keep the existing rollout flags and signed learner secret configured. An OpenAI project key with GPT-Live and supervisor-model access is required.

Open `/live/2?eval=1`. Start the session, select **Record test session**, and download the audio and authenticated teaching trace before ending the session. Recording is opt-in, mixed from the original microphone and remote media streams, and kept in the browser. Review the recording alongside the source-linked specification in the trace. Use a new learner profile for a full fresh run.

| Scenario | Expected behavior |
|---|---|
| Correct immediate answer | Next source passage follows, once only |
| Wrong word, faulty reasoning, or partial answer | Remain on the same question; use authored hints or a probe |
| Pronunciation difficulty | No claim of phonetic correctness from transcript text |
| Okay / yes / mm-hmm | Acknowledge and invite an actual answer |
| Silence or thinking aloud | Let the learner think; no silence-driven advancement |
| Clarification or interruption mid-explanation | Clarify the current passage and resume its unverified content |
| Direct request for the answer | Guide discovery without prematurely revealing it |
| Repeated failure | Escalate the authored hint ladder; remain on the discovery |
| Pause and resume | Explicit pause survives reconnect; resume returns to the active step |
| Disconnect, duplicate event, or concurrent tab | No skipped or double-satisfied steps |
| Browser blocks audio | Enable-audio prompt; no verified delivery while blocked |
| Voice stops with material pending | Bounded continuation retry, then a visible paused state |
| Full lesson | All discoveries and final explanation delivered; Lesson 3 eligible |

Human review must confirm original question intent, required ideas/example order, no premature reveals, productive hints, conversational pacing, and faithful Thinking Method teaching. Record first played audio and turn-to-audio timings separately from backend decision timings. Compare with the original scripted player. Real learners and delayed retention/transfer checks are still required before extending rollout.

## Official protocol sources

- https://developers.openai.com/api/docs/guides/live-conversations
- https://developers.openai.com/api/docs/guides/live-delegation
- The pinned `openai@7.32` Live event and session types.
