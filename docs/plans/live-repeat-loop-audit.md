# Live teaching repeat-loop audit

PR #32, audited 2026-10-12. This is a code and simulated-event audit, not real voice acceptance.

## Evidence and diagnosis

The public production metrics showed two teaching directives, one continuation retry, three delivery interruptions, one delivery-supervisor failure, and no verified-delivery event. They establish that the initial passage was retried before verified advancement. They do not establish the exact event ordering, the supervisor's original error, or whether the retry began while audio was audible; a session trace and recording are required for that.

The code independently contained paths that explain the symptom: the twelve-second watchdog ignored ongoing teacher audio and pending delivery assessment; supervisor failure subsequently fell back to passage replay; and a learner acknowledgment during an unverified explanation could authorize the same passage again.

## End-to-end audit

| Path | Failure or invariant | Fix / verification |
|---|---|---|
| Authorize and send | Sending or append acknowledgment must not advance | Existing conductor/API tests keep the initial step unsatisfied |
| Teacher audio playing | Early captions can finish before the spoken passage | Track audio activity; watchdog does not replay during a twenty-second explanation |
| Playback receipt | Browser and backend selected final events differently when start times tied | Both select maximum end time with arrival tie-breaking; regression verifies delivery |
| Mic overlaps end of teacher speech | Delivery timer can return while mic is active and never run again | Mic becoming quiet rechecks retained playback evidence |
| Delivery supervisor slow | Watchdog can issue duplicate speech while grading | No continuation retry while grading; deferred-response regression |
| Delivery supervisor unavailable | Retry can mean replaying audio rather than retrying verification | Separate cancellable two-second timer; three failures pause, not replay |
| Retry timer lifecycle | Transcript timers, clock changes, pause and close can affect retry scheduling | Separate timer independent of wall-clock deadlines, cancelled on new passage/pause/close |
| Early learner answer | Answer can arrive before question coverage grading finishes | Retain answer until verified question delivery; regression then advances once |
| Pause while grading | Buffer can become stale after delivery and silently lose pause | Explicit pause is handled before delivery wait; late coverage result cannot advance |
| Acknowledgment / thinking | Can restart an unverified explanation | No replay for acknowledgment/thinking or failed interruption classification |
| New speech during old clarification | Old assessment can replay and invalidate the newer turn | Interruption results check learner generation, buffer and step version |
| Answer/model failure | A late “repeat that” prompt can interrupt a newer answer | Failure prompts use the same generation/version guards as successful decisions |
| Reconnect | Old channel transcripts or session.closed can affect the new session | Bind data-channel and remote-track handlers to the current connection |
| Durable resume | Completed delivery must survive reconnect; incomplete speech must replay | Existing checkpoint/CAS, source-version and reconnect tests |
| Concurrent sessions | Two tabs must not commit the same learner progress | Existing Postgres and in-memory ownership/lease tests |
| Learner silence | Silence must never satisfy a discovery question | Existing state-machine and runtime tests |
| Lesson completion | All required steps and question evidence must be satisfied | Complete 59-step simulation plus receipt validation |

## Checks

298 backend tests and 26 frontend tests pass. Both type checks, lint checks and production builds pass. Additional regressions cover the concrete races above, not merely prompt-string contents. Frontend changes are scoped to rejecting events from replaced connections.

## Remaining limits

There is no project API key or authenticated Railway deployment access in this workspace. No real-model/audio end-to-end test was run. Browser RMS/quiet observations remain heuristics; they do not establish sample-accurate playback or that a human listened. Direct WebRTC audio is not gated before playback. Coverage and understanding quality still depend on the supervisor. A permanent supervisor failure will now visibly pause the lesson, not proceed without verification.

Before declaring the reported production issue resolved, deploy backend and frontend together, start a fresh session at /live/2?eval=1, record through the first discovery question, answer it, pause/resume, and reconnect. Download the recording and trace. Check that directives are not repeated while audio plays, failures retry verification on the same passage, receipts advance once, the early answer is retained, and the new session ignores old connection events. Test on the user's phone as well as desktop.
