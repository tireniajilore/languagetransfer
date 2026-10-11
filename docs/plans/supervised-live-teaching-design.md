# Design Doc: Language Transfer — Supervised Live Teaching Architecture

**Status:** Proposed  
**Date:** October 11, 2026  
**Repository:** [tireniajilore/languagetransfer](https://github.com/tireniajilore/languagetransfer)  
**Architecture:** GPT-Live + Parallel Teaching Supervisor + Deterministic Lesson Conductor  
**Initial scope:** Complete Spanish, Lesson 2

---

## 1. Executive Summary

We are building a real-time, conversational AI teacher that delivers the original Language Transfer course using the Thinking Method.

The intended experience is not an open-ended language tutor. It is the Language Transfer course, delivered in the original pedagogical sequence, but with a teacher who can listen, understand, adapt, clarify and respond naturally.

The current implementation is insufficient in three ways:

1. **Weak teaching fidelity.** GPT-Live sometimes improvises new examples and explanations instead of preserving the pedagogical construction of the original lesson.
2. **Unreliable continuity.** The teacher sometimes stops after a learner response, even when significant lesson material remains.
3. **Insufficient control.** The backend controls lesson state, but GPT-Live still makes too many independent decisions about instructional content and progression.

We propose a more explicitly supervised architecture inspired by Sierra's Tandem Voice approach.

- **GPT-Live:** Owns natural spoken interaction.
- **Teaching Supervisor:** Interprets learner behavior and selects the next pedagogical action.
- **Lesson Conductor:** Authorizes actions against the original lesson specification and owns all progression.
- **Learner Memory:** Persists progress, understanding and misconceptions.

We will retain native speech-to-speech. We will not adopt a traditional STT → LLM → TTS pipeline.

**Core design principle: The system decides what to teach. GPT-Live decides how to say it.**

The system must distinguish between an instruction being authorized, its delivery being observed, and the learner demonstrating understanding.

## 2. Product Goals

### G1 — Preserve the original Language Transfer teaching method

Every required concept, discovery, explanation, important example and question must appear in the intended sequence.

The teacher may paraphrase explanations and respond to the learner, but must preserve the original reasoning and intended discoveries.

Success is measured by pedagogical fidelity, not verbatim transcript similarity.

### G2 — Provide genuinely conversational teaching

The learner should be able to:

- Interrupt the teacher naturally.
- Ask why something works.
- Give incorrect or unexpected answers.
- Hesitate or think aloud.
- Ask for another explanation.
- Correct something they previously said.

The teacher should respond intelligently and naturally, without losing the lesson's position.

### G3 — Ensure reliable teaching continuity

The teacher must proactively continue through the lesson.

It must never enter an indefinite idle state because the model forgot to continue, an instruction was dropped, or a learner acknowledgment was misinterpreted.

Pauses for learner thinking, deliberate silence and explicit pause requests must remain supported.

### G4 — Maintain authoritative progression

Only the backend may advance teaching steps, complete lessons or unlock later lessons.

Lesson 3 remains locked until Lesson 2 has been completed according to its defined completion criteria.

### G5 — Make understanding, not phrase matching, the basis for assessment

The system should distinguish:

- Correct answers.
- Correct answers with faulty reasoning.
- Partially correct answers.
- Pronunciation difficulties.
- Misunderstandings.
- Clarification requests.
- Acknowledgments such as "okay."
- Unclear or incomplete speech.

It should use the original teaching goal and current question to determine whether understanding has been demonstrated.

### G6 — Preserve the quality of native voice interaction

Keep GPT-Live's full-duplex speaking, interruptions, natural pacing and responsiveness.

Run deeper teaching reasoning in parallel instead of forcing every small conversational interaction through a slower model.

### G7 — Make teaching quality observable and testable

We must be able to reconstruct:

- What the original lesson required.
- What the conductor authorized.
- What GPT-Live actually said.
- What the learner said.
- Why the supervisor selected an intervention.
- Why a teaching step advanced.
- Whether the learner later demonstrated understanding.

The system must produce enough evidence to distinguish a model-quality issue from an orchestration or transport failure.

---

## 3. Non-Goals

The initial version will not:

- Reproduce the original instructor's exact wording, timing, personality or voice.
- Allow learners to skip lessons or choose arbitrary topics.
- Let GPT-Live autonomously rewrite the curriculum.
- Train or fine-tune a proprietary speech model.
- Replace GPT-Live with a cascaded voice pipeline.
- Require an additional LLM call for every speech fragment.
- Guarantee perfect control over spoken content when audio streams directly to the browser.
- Implement the entire 88-lesson catalog before validating Lesson 2.

We are optimizing for a faithful, intelligent teacher—not a generic conversational companion.

---

## 4. Architectural Decision

Use four cooperating components.

### 4.1 GPT-Live — Conversational Layer

Responsible for:

- Real-time listening and speaking.
- Natural delivery of authorized teaching material.
- Backchannels and brief acknowledgments.
- Handling interruptions.
- Asking short clarifying questions.
- Pronunciation modeling and feedback, subject to evidence quality.
- Conversational warmth and pacing.

GPT-Live is not responsible for:

- Selecting the curriculum.
- Choosing future teaching steps.
- Updating lesson progress.
- Declaring mastery.
- Unlocking lessons.
- Inventing new teaching objectives.

It may respond independently to low-risk conversational interactions within the active teaching scope.

Substantive new explanations, remediation strategies and advancement require application authorization.

### 4.2 Teaching Supervisor — Pedagogical Reasoning Layer

A separate reasoning model with the current teaching objective, learner evidence, relevant conversation and original lesson specification.

Responsible for:

- Classifying learner intent.
- Evaluating understanding.
- Diagnosing misconceptions.
- Choosing an appropriate teaching intervention.
- Determining whether a response satisfies the current question.
- Recommending a continuation, hint, clarification or additional probe.
- Detecting divergence from the authored teaching intent.

The supervisor produces structured decisions, not unrestricted speech.

It can work concurrently with GPT-Live.

Simple, unambiguous cases should use deterministic checks; uncertain or pedagogically meaningful cases are escalated to the reasoning model.

### 4.3 Lesson Conductor — Authoritative State Layer

A deterministic TypeScript engine.

Responsible for:

- Loading the exact lesson version.
- Enforcing teaching order.
- Tracking the current instructional step.
- Validating supervisor decisions.
- Authorizing the next teaching action.
- Tracking delivery and completion.
- Preventing duplicate advancement.
- Persisting checkpoints.
- Enforcing lesson unlocking.

The conductor is the sole source of truth for lesson progress.

### 4.4 Learner Memory — Persistent Learning Layer

Stores:

- Completed lessons and verified steps.
- Concepts introduced.
- Successful discoveries.
- Incorrect answers and misconceptions.
- Hints used.
- Transfer performance.
- Relevant prior knowledge.
- Session and lesson resume state.

Observed evidence must be distinguished from inferred understanding.

Every lesson loads only relevant memory and writes new evidence back to the shared learner profile.

---

## 5. System Architecture

```text
                   LEARNER
                      |
             Bidirectional audio
                      |
              GPT-LIVE SESSION
          Native speech-to-speech
                      |
        +-------------+-------------+
        |                           |
   Conversation                 Transcript and
   / backchannels               session events
        |                           |
        |                   TEACHING SUPERVISOR
        |                   - Intent detection
        |                   - Understanding
        |                   - Misconceptions
        |                   - Next teaching move
        |                           |
        |                   Proposed typed decision
        |                           |
        |                    LESSON CONDUCTOR
        |                    - Original lesson
        |                    - State machine
        |                    - Validation
        |                    - Progression
        |                           |
        |                     LEARNER MEMORY
        |                           |
        +<---- Authorized teaching directive
                 through Live sideband
```

The fast conversation path and slower pedagogical path run concurrently.

The conductor remains authoritative regardless of whether the supervisor is invoked.

We use one dedicated GPT-Live session per active lesson, with shared orchestration infrastructure and lesson-specific configuration.

---

## 6. Core Invariants

These invariants are more important than implementation details.

### 6.1 Hard invariants — Enforced in application code

| ID | Invariant |
|---|---|
| H1 | Every session is bound to one numbered lesson and one immutable lesson-content version. |
| H2 | The backend is the only component authorized to change lesson progress or unlock a subsequent lesson. |
| H3 | Required instructional steps cannot be skipped, reordered or marked complete solely by model assertion. |
| H4 | Learner evidence must reference the specific question and teaching-step version being assessed. |
| H5 | Acknowledgments such as "okay," "yes" or "mm-hmm" do not count as evidence of mastery unless the authored task explicitly asks for acknowledgment. |
| H6 | Partial transcripts, silence and low-confidence recognition cannot independently authorize advancement. |
| H7 | A teaching step cannot be recorded as delivered merely because an instruction was sent or acknowledged. |
| H8 | Each step transition is version-checked and idempotent; duplicate events, reconnects and stale supervisor decisions cannot double-advance progress. |
| H9 | A lesson is completed only after every required teaching step has satisfied its defined completion condition. |
| H10 | Learner memory and progress are only accessible through an authorized learner/session identity. |
| H11 | On restart or reconnection, the session resumes from the last safe checkpoint rather than assuming unverified material was delivered. |
| H12 | If the required control connection becomes unavailable, the system must not authorize further instructional progression. If control cannot be restored safely, terminate or pause the Live session. |

### 6.2 Behavioral requirements — Evaluated, not assumed

The following are targets for GPT-Live and the combined system. Prompting and reactive transcript monitoring alone cannot make them absolute guarantees:

| ID | Requirement |
|---|---|
| B1 | GPT-Live follows the authorized teaching material rather than inventing a new lesson. |
| B2 | It preserves the meaning, examples and reasoning behind the original question. |
| B3 | It does not audibly reveal an answer before the learner has had the intended opportunity to derive it. |
| B4 | It does not teach material from a future step without authorization. |
| B5 | It continues appropriately after an answer, interruption or clarification. |
| B6 | It maintains natural pacing without excessive filler or repetitive praise. |
| B7 | It responds to hesitation as a teaching signal, not necessarily as a completed answer. |

A strong pre-playback guarantee for B3 or B4 requires control over the actual audio delivered to the listener. That is a separate, optional enforcement layer.

**We must never label a behavioral requirement as "enforced" merely because it appears in a prompt.**

---

## 7. Lesson Specification

The raw Language Transfer transcript is the canonical content source, but raw transcript text alone is insufficient for adaptive instruction.

We introduce a compiled *Teaching Specification* for each lesson.

Each authored step contains:

```typescript
type TeachingStep = {
  id: string;
  lessonId: string;
  order: number;
  sourceTurnIds: string[];

  type:
    | "explanation"
    | "discovery_question"
    | "guided_practice"
    | "reflection"
    | "transfer_test";

  sourceTranscript: string[];

  pedagogicalGoal: string;
  requiredIdeas: string[];
  requiredExamples: string[];
  requiredQuestion?: string;

  acceptableAnswers?: string[];
  understandingRubric?: string[];

  commonMisconceptions: string[];
  hintLadder: string[];

  prerequisites: string[];
  completionCriteria: string[];

  nextStepId?: string;
};
```

### Important distinctions

**Source transcript:** What the original instructor actually taught.

**Teaching specification:** What must be preserved when the model paraphrases or adapts.

**Authorized directive:** What GPT-Live is permitted to do next.

These are three separate artifacts.

### Content-production rule

The teaching specification must be traceable to source transcript turns.

No LLM-generated material may silently become canonical curriculum content.

LLMs may propose structured teaching specifications, but content changes require validation against the original transcript and pedagogical review.

For the MVP, audit and validate Lesson 2 manually before generalizing.

### Example: the original metal question

**Original discovery:** English words ending in -al can often transfer into Spanish, with a shift in stress.

**Required reasoning:**

- Recognize the relationship between English and Spanish Latin vocabulary.
- Apply the -al pattern.
- Preserve the word's spelling where appropriate.
- Adjust final-syllable stress.

**Required question:** How would you say "metal"?

**Possible responses:**

- Correct word and stress → continue.
- Correct word, uncertain pronunciation → guide pronunciation.
- Different word → clarify the question or provide an appropriate hint.
- "I don't know" → revisit the previously introduced pattern.
- "Why does the stress change?" → briefly clarify and return to the question.
- "Okay" → acknowledgment only; do not infer mastery.

The required teaching goal is stable. The intervention is adaptive.

---

## 8. Lesson State Machine

The current approach risks conflating *moving the cursor* with *successfully delivering teaching*.

These must be separated.

### Proposed lifecycle

```text
READY
  |
  v
STEP_AUTHORIZED
  |
  v
DIRECTIVE_SENT
  |
  v
DIRECTIVE_ACKNOWLEDGED
  |
  v
DELIVERY_IN_PROGRESS
  |
  +------ Interrupted ------> RECOVERY
  |
  v
DELIVERY_OBSERVED
  |
  +------ Explanation ------> STEP_SATISFIED
  |
  v
AWAITING_LEARNER
  |
  v
ASSESSING
  |
  +------ Incorrect --------> REMEDIATING
  |                              |
  |                              v
  |                       AWAITING_LEARNER
  |
  +------ Unclear ----------> CLARIFYING
  |                              |
  |                              v
  |                       AWAITING_LEARNER
  |
  v
STEP_SATISFIED
  |
  v
NEXT STEP
```

A lesson completes only after the final required step reaches `STEP_SATISFIED`.

For explanation steps, satisfaction requires credible delivery evidence.

For discovery questions, satisfaction requires the relevant understanding evidence.

### Delivery evidence

Different events prove different things:

- **Directive sent:** Our backend requested the teaching action.
- **Directive acknowledged:** GPT-Live accepted the context update.
- **Speech observed:** The output transcript indicates relevant speech was generated.
- **Playback observed:** The client has evidence that the audio was played or reached the playback boundary.
- **Learner understood:** The learner demonstrated the target understanding.

No single event substitutes for the others.

Playback telemetry cannot prove that a human actually listened. If playback evidence is unavailable or ambiguous, preserve a conservative checkpoint and offer an appropriate recap on resume.

---

## 9. Supervisor Decision Contract

The supervisor receives:

- Current lesson and step.
- Original authored source spans.
- Pedagogical goal.
- Current question and expected discovery.
- Recent learner speech and relevant context.
- Prior attempts and hints.
- Relevant learner memory.
- Current conductor state/version.

It returns a typed proposal:

```typescript
type TeachingDecision = {
  lessonId: string;
  stepId: string;
  stateVersion: number;

  learnerIntent:
    | "answer"
    | "clarification"
    | "acknowledgment"
    | "thinking"
    | "interruption"
    | "pause_request"
    | "off_topic";

  understanding:
    | "demonstrated"
    | "partial"
    | "incorrect"
    | "unclear"
    | "not_assessed";

  evidence: string[];

  proposedAction:
    | "continue"
    | "give_hint"
    | "rephrase"
    | "probe"
    | "correct"
    | "repeat"
    | "wait"
    | "pause"
    | "advance";

  proposedHintLevel?: number;
  reasoningSummary: string;
  confidence: number;
};
```

The conductor validates the proposal against its state, the question's rubric, and the allowed moves.

**The supervisor recommends. The conductor commits.**

A proposed `advance` action is rejected if the current step has not met its completion criteria.

Low-confidence assessments require clarification or further observation, not optimistic advancement.

We should not expose the supervisor's private reasoning to the voice model. Return only the validated teaching action and information needed for delivery.

---

## 10. Real-Time Teaching Loop

### Fast path — Native conversational interaction

GPT-Live handles:

- Brief acknowledgment.
- Requests to repeat.
- Natural turn-taking.
- Simple clarifications within the permitted scope.
- Listening while the learner thinks.

No extra LLM call is necessary for every micro-interaction.

### Supervised path — Meaningful teaching decisions

Triggered by:

- A substantive learner answer.
- Incorrect or contradictory reasoning.
- A completed required discovery.
- Repeated struggle.
- A request for a substantial explanation.
- Potential teaching drift.
- A decision to advance.

Sequence:

1. Collect appropriately grouped learner evidence.
2. Associate it with the active authored question.
3. Apply deterministic checks where sufficient.
4. Invoke the supervisor where needed.
5. Validate the proposed action in the conductor.
6. Persist any authorized transition transactionally.
7. Send the new directive to GPT-Live.
8. Verify delivery and monitor for drift.

### Audio-first principle

The reasoning path does not replace native speech-to-speech.

While the supervisor works, GPT-Live may continue listening and use brief acknowledgments. It must not invent an assessment result or advance teaching content.

Avoid filler such as repeatedly saying "let me think."

---

## 11. GPT-Live Control Protocol

The implementation must follow the actual GPT-Live protocol, not assume that legacy Realtime events have equivalent meanings.

### Startup

1. Verify learner identity and requested lesson eligibility.
2. Load the authored lesson specification and previous checkpoint.
3. Create a lesson-specific GPT-Live session.
4. Connect WebRTC audio and the trusted server-side sideband.
5. Wait for `session.started` and required session readiness conditions.
6. Send the authorized lesson opening as application-authored instructions and speakable context.
7. Track update acknowledgment and observe the resulting speech.

The tutor must open with the original lesson's first teaching material, not ask the learner what they want to study.

### During the lesson

Use the GPT-Live context channels intentionally:

- `session.instructions.append` — current teaching constraints or corrective direction.
- `session.thinking.append` — verified lesson state and other quiet factual context.
- `session.commentary.append` — approved content the teacher should communicate aloud.

Each append must include:

- `event_id`
- `delegation_id` (`null` for session-wide context)
- `content` within the supported size limit.

Track acknowledgments and errors by event ID.

Acknowledgments do not prove that the model followed an instruction or finished speaking.

### Delegation

Favor application-owned **client delegation** for pedagogical reasoning so the backend chooses the supervisor model, context, tools, timeouts, validation and results.

The backend may also run proactive transcript analysis without waiting for GPT-Live to request delegation.

Do not misuse `response.create` as a generic command to force GPT-Live to speak; its documented role is starting or continuing Responses-delegated backend work.

### Transcript processing

GPT-Live transcript deltas are fragments, not complete conversational turns.

Process them using a turn-assembly layer that considers:

- Speaker identity.
- Stream timing.
- Transcript fragment ordering.
- Acoustic activity where available.
- Pauses and interruption signals.
- Whether the active teaching question expects a short or extended response.

Quiet-time detection is a heuristic, not proof that an utterance is complete.

Avoid double-assessing the same spoken answer.

---

## 12. Continuity and Recovery

The application—not GPT-Live—owns the obligation to continue teaching.

Implement a state-aware continuation controller.

### Cases

**A. Teacher completes an explanation**

If the next required question has not been delivered, issue the next authorized action.

**B. Learner gives a valid answer**

Assess, authorize continuation, and deliver the next teaching material.

**C. Learner says "okay"**

If a discovery question is outstanding, do not advance solely on acknowledgment. Briefly invite an actual answer or clarify the prompt.

**D. Learner asks a question**

Answer within scope, then resume the interrupted explanation or outstanding question.

**E. Learner remains silent while thinking**

Wait appropriately. Offer a hint only after a reasonable interval or explicit signal of struggle; do not interpret thinking time as failure.

**F. GPT-Live becomes unexpectedly silent**

If a teaching directive is pending but no corresponding output is observed within the configured watchdog window, reconcile state, inspect acknowledgments and issue a controlled retry or recovery directive.

Do not repeatedly restart the same instruction without idempotency controls.

**G. Connection or sideband drops**

Freeze progression. Reconcile the authoritative checkpoint and any confirmed delivery before resuming.

**H. Learner returns later**

Restore their lesson, last safe checkpoint, and relevant memory. Offer a short refresher if the previous passage's delivery or understanding is uncertain.

### Important distinction

**Waiting for a learner is not a stall.**

A stall exists when the application owes the learner an action and fails to produce it.

Watchdogs must use the authoritative state rather than a generic silence threshold.

---

## 13. Speech Fidelity and Enforcement

We need three layers.

### Level 1 — Prevent drift through scope

Only provide the current teaching step, relevant prior knowledge and necessary immediate context.

Avoid giving GPT-Live the entire future lesson and its answers.

### Level 2 — Detect and recover

Compare observed assistant speech against:

- Required ideas.
- Authorized examples.
- Required question.
- Prohibited premature material.
- Outstanding teaching obligations.

If drift is detected, redirect and recover without advancing the conductor.

### Level 3 — Optional pre-playback validation

If severe speech violations remain frequent, introduce selective control over the audio output path.

Buffer speech segments, validate associated content, and release or discard audio accordingly.

This is substantially more complex than transcript monitoring because we must account for audio buffering, latency, alignment, cancellation and interruptions.

The current direct WebRTC playback architecture cannot guarantee that a supervisor reviews each word before the learner hears it.

**Decision:** Begin with Levels 1 and 2. Prototype Level 3 only if measured performance requires it.

Do not describe Level 2 as preventative enforcement.

---

## 14. Performance Targets

These are proposed launch targets, not current measured performance.

| Metric | Initial target |
|---|---|
| First meaningful spoken response after session readiness | P95 under 2 seconds |
| Routine response onset after clear learner turn | P95 under 1 second |
| Supervised teaching decision | P95 under 2 seconds |
| Unintended instructional stalls | 0 in MVP acceptance runs |
| Invalid lesson transitions | 0 |
| Duplicate cursor advancement | 0 |
| Required-step coverage | At least 98% |
| Material unauthorized teaching drift | Under 2% of instructional turns |
| Persistent resume success | At least 99% in automated recovery tests |

Latency measures should distinguish:

- Learner speaking endpoint.
- Supervisor decision time.
- Context update delivery.
- First generated audio.
- First played audio.
- Completion of audible delivery.

Report distributions, not only averages.

The system should not sacrifice pedagogical correctness solely to meet a latency target.

---

## 15. Evaluation Strategy

### 15.1 Deterministic tests

Verify:

- Lesson order.
- State validation.
- Idempotency.
- Authentication.
- Unlocking rules.
- Checkpoint persistence.
- Stale decision rejection.
- Duplicate transcript handling.
- Incorrect-answer behavior.
- Interrupted delivery recovery.

### 15.2 Simulated learner scenarios

At minimum:

1. Correct answer immediately.
2. Incorrect answer.
3. Correct answer with faulty reasoning.
4. Partial answer.
5. Unclear pronunciation.
6. Silence while thinking.
7. "Okay" in response to a teaching question.
8. Interrupting a long explanation.
9. Asking an unrelated question.
10. Asking for the answer directly.
11. Repeated failure requiring a different teaching strategy.
12. Disconnecting and resuming midway.

Each scenario must check both the conductor's state and the teacher's actual spoken behavior.

### 15.3 Transcript-fidelity evaluation

Compare complete recorded sessions with the original Language Transfer lesson.

Assess:

- Required ideas covered.
- Original question intent preserved.
- Examples presented in order.
- Premature reveals.
- Unsupported additions.
- Unnecessary repetition.
- Appropriate hints.
- Whether the learner was guided to derive the answer.

Automatic grading should be supplemented by human review of recorded audio.

### 15.4 Learning outcome evaluation

A successful tutor should improve learning, not merely resemble the source.

Measure:

- Whether the learner can derive the original target.
- Whether they can solve an unfamiliar transfer example.
- Whether they retain the concept after a delay.
- Whether subsequent lessons benefit from previous learning.

Compare against the original scripted player where feasible.

---

## 16. Implementation Plan

### PR 1 — Teaching specification and conductor correctness

- Audit the original Lesson 2 transcript and JSON.
- Build a pedagogically annotated teaching specification.
- Separate authorization, delivery and understanding state.
- Introduce versioned teaching actions.
- Implement strict, transactional progression.
- Add invariant tests.

**Exit criterion:** The lesson conductor can execute Lesson 2 correctly with simulated learners without requiring a voice model.

### PR 2 — Supervisor integration

- Build the structured learner-understanding supervisor.
- Route deterministic and ambiguous cases appropriately.
- Add misconception handling and hint selection.
- Bind every decision to the active step/version.
- Block stale or invalid actions.

**Exit criterion:** The supervisor reliably classifies realistic learner responses and cannot change the syllabus.

### PR 3 — GPT-Live orchestration

- Align sideband commands with the documented GPT-Live API.
- Initialize each session with its lesson scope.
- Send authorized teaching directives.
- Handle acknowledgments, errors and retries.
- Improve transcript turn assembly.
- Implement state-aware continuation.
- Add drift detection.

**Exit criterion:** Lesson 2 reliably progresses through its source teaching sequence in live speech-to-speech sessions.

### PR 4 — Voice evaluations and reliability

- Add end-to-end audio-native evaluations.
- Test interruptions, long pauses and poor connectivity.
- Persist delivery checkpoints.
- Add tracing and teaching-quality dashboards.
- Measure actual pedagogical fidelity and latency.
- Compare outcomes against the original scripted player.

**Exit criterion:** Lesson 2 passes the MVP acceptance suite and human audio review.

Only then generalize the compiler and orchestrator to subsequent lessons.

---

## 17. MVP Acceptance Criteria

The implementation is accepted when:

1. Starting Lesson 2 begins with its actual authored introduction.
2. The tutor follows the original required concepts and questions in order.
3. The learner can interrupt naturally without losing their position.
4. The tutor responds intelligently to incorrect or unexpected answers.
5. A generic acknowledgment cannot falsely complete a discovery.
6. The tutor does not stall after a completed question or explanation.
7. Every advancement is attributable to an authorized and recorded decision.
8. The lesson cannot be marked complete while required teaching remains.
9. Reconnecting restores the learner's last safe checkpoint.
10. Lesson 3 unlocks only after verified Lesson 2 completion.
11. Audio recordings demonstrate the intended Thinking Method rather than generic Spanish tutoring.
12. The experience remains native GPT-Live speech-to-speech.

All automated tests and a small set of real-learner sessions must pass before expanding the rollout.

---

## 18. Known Risks and Open Questions

**R1 — Spoken compliance:** GPT-Live may still deviate from approved content despite prompt-level controls. Measure the severity before adding audio gating.

**R2 — Supervisor latency:** Complex teaching decisions may interrupt conversational flow. Use a fast path and bounded supervisor latency.

**R3 — Transcript uncertainty:** Voice transcripts may omit or distort pronunciation and incomplete speech. Do not infer mastery from text alone when acoustic distinctions matter.

**R4 — Curriculum fidelity:** Existing lesson JSON may omit nuance present in the original recording. Validate the canonical source and its rights for distribution.

**R5 — Progress semantics:** Hearing an explanation, participating in a question and demonstrating understanding are different outcomes. The data model must preserve that distinction.

**R6 — Concurrent sessions:** Multiple sessions for one learner require explicit concurrency control and version checks.

**R7 — Model autonomy:** Complete prevention of unauthorized spoken content is not currently guaranteed with direct browser audio playback. This limitation must be visible in evaluation reports.

### Open design decisions

- Whether to require supervisor confirmation for every required discovery or allow high-confidence deterministic acceptance.
- Whether pronunciation evaluation needs additional audio features beyond GPT-Live's transcript.
- Whether the final lesson checkpoint should require a separate transfer question.
- What measured speech-violation threshold justifies introducing pre-playback gating.
- Whether the model should paraphrase original questions or preserve their exact wording more strictly.

Defaults: deterministic checks for unambiguous answers, supervisor for ambiguous or significant judgments, and strict preservation of the original question's pedagogical intent.

---

## 19. Final Architectural Principle

The Language Transfer course is the curriculum.

The conductor is the authority.

The supervisor is the pedagogical intelligence.

GPT-Live is the conversational performer.

The learner is free to speak naturally, but the system never loses its responsibility to teach the prescribed material.

**The objective is not to make GPT-Live behave like a better general Spanish tutor. It is to make an application-controlled Language Transfer teacher feel as natural as a real conversation.**

---

## References

- [Sierra — Tandem Voice and Curie announcement](https://sierra.ai/blog/summit-recap-2026)
- [OpenAI — Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [OpenAI — Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)
- [OpenAI — Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)
- [OpenAI — Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting)
- [OpenAI — Migrating to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration)
- [Pipecat — Structured conversation flows](https://github.com/pipecat-ai/pipecat/tree/main/examples/flows)
- [Existing Language Transfer repository](https://github.com/tireniajilore/languagetransfer)
