/** One session, one immutable specification; state writes are awaited and version checked. */
import { randomUUID } from 'node:crypto';
import { CourseStore } from './courseStore';
import { pronunciationInstructions } from './pronunciation';
import { getTeachingSpec, type TeachingSpecification } from './teachingSpec';
import {
  acknowledge,
  applyDecision,
  authorizeStep,
  confirmDelivery,
  markSent,
  observeSpeech,
  recoverCheckpoint,
  type TeachingCheckpoint,
} from './supervisedConductor';
import { deterministicDecision, type TeachingSupervisor } from './supervisor';
import { recordCounter, recordLatency } from '../metrics';

export interface TranscriptFragment {
  event_id?: string;
  start_ms?: number;
  end_ms?: number;
  delta?: string;
}
export interface PlaybackActivity {
  speaker: 'user' | 'assistant';
  speaking: boolean;
  playing?: boolean;
  outputEventId?: string;
  seq: number;
}
interface Buffer {
  fragments: TranscriptFragment[];
  version: number;
  stepId: string;
  timer: ReturnType<typeof setTimeout> | null;
}
export interface RuntimeIO {
  send(command: Record<string, unknown>): void;
  fail(error: unknown): void;
}
export class LessonRuntime {
  readonly spec: TeachingSpecification;
  private state: TeachingCheckpoint;
  private revision: number;
  private chain: Promise<unknown> = Promise.resolve();
  private started = false;
  private stopped = false;
  private controlReady = false;
  private buffers: Partial<Record<'user' | 'assistant', Buffer>> = {};
  private seen = new Set<string>();
  private outputText = '';
  private outputGeneration = 0;
  private userGeneration = 0;
  private playbackBoundary: string | null = null;
  private microphoneActive = false;
  private assistantSpeaking = false;
  private deliveryFailures = 0;
  private deliveryRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivitySeq = { user: -1, assistant: -1 };
  private deliveryInFlight = false;
  private lastActionAt = 0;
  private retries = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private heartbeatAt = 0;
  private lastClientAt = Date.now();
  private trace: Array<Record<string, unknown>> = [];
  constructor(
    private readonly sessionId: string,
    private readonly learnerId: string,
    private readonly course: CourseStore,
    saved: { revision: number; checkpoint: TeachingCheckpoint },
    private readonly supervisor: TeachingSupervisor,
    private readonly io: RuntimeIO,
  ) {
    this.spec = getTeachingSpec(saved.checkpoint.lessonNumber);
    this.state = saved.checkpoint;
    this.revision = saved.revision;
  }
  get cursor(): TeachingCheckpoint {
    return structuredClone(this.state);
  }
  get audit(): Array<Record<string, unknown>> {
    return structuredClone(this.trace);
  }
  private log(event: string, detail: Record<string, unknown> = {}): void {
    const entry = {
      event,
      sessionId: this.sessionId,
      stepId: this.spec.steps[this.state.stepIndex]?.id,
      stateVersion: this.state.stateVersion,
      at: Date.now(),
      ...detail,
    };
    this.trace.push(entry);
    if (this.trace.length > 300) this.trace.shift();
    console.log(JSON.stringify({ component: 'teaching', ...entry }));
    recordCounter(`teaching.${event}`);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn);
    this.chain = p.catch(() => undefined);
    return p;
  }
  private async commit(next: TeachingCheckpoint): Promise<void> {
    if (this.stopped || next === this.state) return;
    const revision = await this.course.checkpoints.save(
      this.learnerId,
      this.sessionId,
      this.revision,
      next,
    );
    this.revision = revision;
    this.state = next;
  }
  setControlReady(ready: boolean): void {
    if (this.controlReady === ready) return;
    this.controlReady = ready;
    if (!ready && this.started) {
      this.outputGeneration++;
      this.clearBuffers();
      this.playbackBoundary = null;
      this.log('control_lost');
      // Cannot safely steer through a missing control socket. Terminate the call
      // rather than let an uncontrolled session continue teaching during a reconnect.
      this.io.fail(new Error('teaching control connection lost'));
    }
  }
  async start(): Promise<void> {
    return this.serial(async () => {
      if (this.started) return;
      if (!this.controlReady) throw new Error('teaching control is not ready');
      this.lastClientAt = Date.now();
      this.started = true;
      if (this.state.phase !== 'paused')
        await this.commit(recoverCheckpoint(this.state));
      await this.issueStep();
      this.heartbeatAt = Date.now();
      this.watchdog = setInterval(() => {
        void this.tick().catch((e) => this.fail(e));
      }, 1000);
      this.watchdog.unref();
    });
  }
  private append(
    type:
      | 'session.instructions.append'
      | 'session.commentary.append'
      | 'session.thinking.append',
    content: string,
    id: string,
    delegationId: string | null = null,
  ): void {
    // Byte-BPE token counts cannot exceed UTF-8 bytes; this conservative bound
    // keeps even uncommon spellings under the documented 500-token limit.
    if (Buffer.byteLength(content, 'utf8') > 500)
      throw new Error('Live append exceeds conservative token budget');
    if (!this.controlReady || this.stopped)
      throw new Error('teaching control unavailable');
    this.io.send({ type, event_id: id, delegation_id: delegationId, content });
  }
  private async issueStep(clarification = false): Promise<void> {
    if (this.stopped || !this.controlReady || this.state.phase === 'paused')
      return;
    if (this.state.phase === 'completed') {
      this.append(
        'session.commentary.append',
        'You have completed this lesson. Well done. We will stop here.',
        `complete_${randomUUID()}`,
      );
      this.log('lesson_completed');
      return;
    }
    const step = this.spec.steps[this.state.stepIndex];
    if (this.buffers.assistant?.timer)
      clearTimeout(this.buffers.assistant.timer);
    delete this.buffers.assistant;
    this.outputText = '';
    this.deliveryFailures = 0;
    if (this.deliveryRetryTimer) clearTimeout(this.deliveryRetryTimer);
    this.deliveryRetryTimer = null;
    this.playbackBoundary = null;
    this.outputGeneration++;
    const id = `teach_${randomUUID()}`;
    await this.commit(authorizeStep(this.spec, this.state, id));
    for (const [index, content] of pronunciationInstructions(
      step.text,
    ).entries())
      this.append(
        'session.instructions.append',
        content,
        `pronunciation_${id}_${index}`,
      );
    this.append(
      'session.instructions.append',
      `Authorized ${step.id}. Speak the English script in English with natural English pronunciation; never translate it. Spanish pronunciation only for identified Spanish examples. ${clarification ? 'Clarify this passage, then resume it.' : 'Begin now.'} Preserve ideas and examples in order. ${step.kind === 'question' ? 'Ask this question, then wait; never reveal its answer.' : 'Wait for application continuation afterward.'}`,
      `scope_${id}`,
    );
    // Long legacy steps are deliberately not silently truncated.
    const chunks: string[] = [];
    let chunk = '';
    for (const word of step.text.split(' ')) {
      const candidate = chunk ? `${chunk} ${word}` : word;
      if (Buffer.byteLength(candidate) > 460) {
        chunks.push(chunk);
        chunk = word;
      } else chunk = candidate;
    }
    if (chunk) chunks.push(chunk);
    for (const [i, content] of chunks.entries())
      this.append(
        'session.commentary.append',
        content,
        i === chunks.length - 1 ? id : `${id}_${i}`,
      );
    await this.commit(markSent(this.state));
    this.lastActionAt = Date.now();
    this.log('directive_sent', { directiveId: id });
  }
  onEvent(event: Record<string, unknown>): void {
    if (this.stopped) return;
    if (
      event.type === 'session.instructions.appended' ||
      event.type === 'session.commentary.appended'
    ) {
      const id = event.client_event_id;
      if (typeof id === 'string')
        void this.serial(async () => {
          await this.commit(acknowledge(this.state, id));
          this.log('append_acknowledged', { clientEventId: id });
        }).catch((e) => this.fail(e));
    } else if (event.type === 'error') {
      const error = event.error as { client_event_id?: string } | undefined;
      this.log('command_error', { clientEventId: error?.client_event_id });
      this.fail(new Error('Live rejected a teaching command'));
    } else if (event.type === 'session.delegation.created') {
      const delegation = event.delegation as
        | { id?: string; target?: string }
        | undefined;
      if (delegation?.target === 'client' && delegation.id) {
        // Transcript processing already owns assessment. Delegation metadata contains no request text.
        // Keep this reply quiet; a duplicate spoken directive would interrupt the pending assessment.
        this.append(
          'session.thinking.append',
          'The application owns assessment and progression. Listen while it evaluates the current learner turn. Do not select a new teaching step.',
          `delegation_${randomUUID()}`,
          delegation.id,
        );
      }
    }
  }
  onFragment(
    speaker: 'user' | 'assistant',
    fragment: TranscriptFragment,
  ): void {
    if (this.stopped || !this.started || !fragment.delta || !fragment.event_id)
      return;
    if (this.seen.has(fragment.event_id)) return;
    this.seen.add(fragment.event_id);
    if (this.seen.size > 4096)
      this.seen.delete(this.seen.values().next().value!);
    let buffer = this.buffers[speaker];
    if (!buffer) {
      buffer = {
        fragments: [],
        version: this.state.stateVersion,
        stepId: this.spec.steps[this.state.stepIndex]?.id ?? '',
        timer: null,
      };
      this.buffers[speaker] = buffer;
    }
    buffer.fragments.push(fragment);
    if (speaker === 'user') this.userGeneration++;
    if (speaker === 'assistant') {
      this.outputGeneration++;
      if (
        buffer.fragments.reduce((n, f) => n + (f.delta?.length ?? 0), 0) > 10000
      ) {
        this.fail(new Error('unbounded teacher output'));
        return;
      }
      this.lastActionAt = Date.now();
      const finalEventId = this.assembled(buffer).eventId;
      void this.serial(async () => {
        await this.commit(observeSpeech(this.state, finalEventId));
      }).catch((e) => this.fail(e));
    }
    if (buffer.timer) clearTimeout(buffer.timer);
    // Deltas have no turn-final event. Quiet time merely schedules analysis;
    // mic activity and complete-question semantics still determine eligibility.
    buffer.timer = setTimeout(
      () => {
        void this.flush(speaker).catch((e) => this.fail(e));
      },
      speaker === 'user' ? 1500 : 1100,
    );
    buffer.timer.unref();
  }
  async activity(activity: PlaybackActivity): Promise<void> {
    if (activity.seq <= this.lastActivitySeq[activity.speaker]) return;
    this.lastActivitySeq[activity.speaker] = activity.seq;
    this.lastClientAt = Date.now();
    if (activity.speaker === 'user') {
      const startedSpeaking = activity.speaking && !this.microphoneActive;
      this.microphoneActive = activity.speaking;
      if (
        startedSpeaking &&
        !this.playbackBoundary &&
        ['delivering', 'sent', 'acknowledged'].includes(this.state.phase)
      ) {
        this.outputGeneration++;
        this.playbackBoundary = null;
        this.log('delivery_interrupted');
      }
      if (!activity.speaking && this.playbackBoundary) {
        await this.chain;
        await this.flush('assistant');
      }
      return;
    }
    const resumedAudio = activity.speaking && !this.assistantSpeaking;
    this.assistantSpeaking = activity.speaking;
    if (activity.speaking) {
      this.lastActionAt = Date.now();
      if (resumedAudio) this.outputGeneration++;
      this.playbackBoundary = null;
      return;
    }
    if (activity.playing && activity.outputEventId) {
      await this.chain;
      this.playbackBoundary = activity.outputEventId;
      await this.flush('assistant');
    }
  }
  private assembled(buffer: Buffer): { text: string; eventId: string } {
    const ordered = buffer.fragments
      .map((f, i) => ({ f, i }))
      .sort(
        (a, b) =>
          (a.f.start_ms ?? a.i) - (b.f.start_ms ?? b.i) ||
          (a.f.end_ms ?? a.i) - (b.f.end_ms ?? b.i),
      );
    // Match the browser's latest output boundary: maximum end time, with the
    // latest arrival breaking ties. Text remains ordered by start time.
    let boundary = buffer.fragments[0];
    let end = -1;
    for (const fragment of buffer.fragments) {
      const candidate = fragment.end_ms ?? end + 1;
      if (candidate >= end) {
        boundary = fragment;
        end = candidate;
      }
    }
    return {
      text: ordered.map((x) => x.f.delta ?? '').join(''),
      eventId: boundary.event_id!,
    };
  }

  private async flush(speaker: 'user' | 'assistant'): Promise<void> {
    const buffer = this.buffers[speaker];
    if (!buffer?.fragments.length) return;
    if (speaker === 'user' && this.microphoneActive) {
      if (buffer.timer) clearTimeout(buffer.timer);
      buffer.timer = setTimeout(() => {
        void this.flush('user').catch((e) => this.fail(e));
      }, 1000);
      buffer.timer.unref();
      return;
    }
    if (buffer.timer) clearTimeout(buffer.timer);
    buffer.timer = null;
    const { text, eventId } = this.assembled(buffer);
    const snapshot = this.cursor;
    if (speaker === 'assistant') {
      this.outputText = text;
      if (
        this.deliveryInFlight ||
        this.assistantSpeaking ||
        this.deliveryRetryTimer !== null ||
        this.playbackBoundary !== eventId ||
        snapshot.directive?.outputEventId !== eventId ||
        snapshot.phase !== 'delivering' ||
        this.microphoneActive
      )
        return;
      const generation = this.outputGeneration;
      const started = Date.now();
      this.deliveryInFlight = true;
      let assessment;
      try {
        assessment = await this.supervisor.delivery(this.spec, snapshot, text);
      } catch (error) {
        if (
          this.stopped ||
          generation !== this.outputGeneration ||
          snapshot.stateVersion !== this.state.stateVersion
        )
          return;
        this.deliveryFailures++;
        this.lastActionAt = Date.now();
        const details =
          error && typeof error === 'object'
            ? (error as { name?: unknown; status?: unknown; code?: unknown })
            : {};
        this.log('delivery_supervisor_unavailable', {
          attempt: this.deliveryFailures,
          errorType:
            typeof details.name === 'string' &&
            /^[A-Za-z]+Error$/.test(details.name)
              ? details.name
              : 'Error',
          httpStatus:
            typeof details.status === 'number' ? details.status : null,
          errorCode:
            typeof details.code === 'string' &&
            /^[a-z_]{1,64}$/.test(details.code)
              ? details.code
              : null,
        });
        if (this.deliveryFailures >= 3) {
          await this.serial(async () => {
            if (snapshot.stateVersion === this.state.stateVersion)
              await this.pause(
                'Delivery verification is temporarily unavailable',
              );
          });
        } else {
          this.deliveryRetryTimer = setTimeout(() => {
            this.deliveryRetryTimer = null;
            void this.flush('assistant').catch((e) => this.fail(e));
          }, 2000);
          this.deliveryRetryTimer.unref();
        }
        return;
      } finally {
        this.deliveryInFlight = false;
      }
      recordLatency('teaching.delivery_assessment_ms', Date.now() - started);
      await this.serial(async () => {
        if (
          this.stopped ||
          generation !== this.outputGeneration ||
          snapshot.stateVersion !== this.state.stateVersion ||
          this.state.phase !== 'delivering'
        )
          return;
        this.log('delivery_assessed', { eventId, assessment });
        const next = confirmDelivery(
          this.spec,
          this.state,
          eventId,
          assessment.covered &&
            !assessment.drift &&
            assessment.confidence >= 0.9,
          true,
          text,
        );
        if (next === this.state) {
          this.retries++;
          if (this.retries > 2) {
            await this.pause('Unable to verify teaching delivery');
            return;
          }
          await this.issueStep();
          return;
        }
        delete this.buffers.assistant;
        await this.commit(next);
        this.retries = 0;
        this.log('delivery_observed', { eventId });
        if (next.phase === 'ready' || next.phase === 'completed')
          await this.issueStep();
      });
      return;
    }
    if (snapshot.phase === 'completed') {
      delete this.buffers.user;
      return;
    }
    const userGeneration = this.userGeneration;
    if (
      deterministicDecision(this.spec, snapshot, text)?.learnerIntent ===
      'pause_request'
    ) {
      delete this.buffers.user;
      await this.serial(async () => {
        if (!this.stopped && userGeneration === this.userGeneration)
          await this.pause('Learner requested pause');
      });
      return;
    }
    if (
      snapshot.phase !== 'awaiting_answer' &&
      snapshot.phase !== 'paused' &&
      (this.deliveryInFlight || this.playbackBoundary)
    ) {
      buffer.timer = setTimeout(() => {
        void this.flush('user').catch((e) => this.fail(e));
      }, 500);
      buffer.timer.unref();
      return;
    }
    delete this.buffers.user;
    if (
      buffer.stepId !== this.spec.steps[snapshot.stepIndex]?.id ||
      buffer.version !== snapshot.stateVersion
    )
      return;
    if (snapshot.phase === 'paused') {
      if (
        /^(resume|continue|start again|let s continue)[.!?]*$/i.test(
          text.trim(),
        )
      )
        await this.serial(async () => {
          await this.commit(recoverCheckpoint(this.state));
          await this.issueStep();
        });
      return;
    }
    if (snapshot.phase !== 'awaiting_answer') {
      // Classify interruptions without treating them as answers to an undelivered question.
      let intervention;
      try {
        intervention = await this.supervisor.assess(this.spec, snapshot, text);
      } catch {
        intervention = null;
      }
      await this.serial(async () => {
        if (
          this.stopped ||
          userGeneration !== this.userGeneration ||
          this.buffers.user ||
          snapshot.stateVersion !== this.state.stateVersion
        )
          return;
        if (intervention?.learnerIntent === 'pause_request') {
          await this.pause('Learner requested pause');
          return;
        }
        this.log('interruption', {
          eventId,
          text: text.slice(0, 1000),
          intent: intervention?.learnerIntent,
        });
        if (
          !intervention ||
          ['acknowledgment', 'thinking', 'off_topic'].includes(
            intervention.learnerIntent,
          )
        )
          return;
        await this.issueStep(intervention.learnerIntent === 'clarification');
      });
      return;
    }

    const started = Date.now();
    let decision;
    try {
      decision = await this.supervisor.assess(this.spec, snapshot, text);
    } catch {
      this.log('supervisor_unavailable');
      // No guess or advancement on timeouts; the learner can repeat to retry.
      await this.serial(async () => {
        if (
          !this.stopped &&
          userGeneration === this.userGeneration &&
          !this.buffers.user &&
          snapshot.stateVersion === this.state.stateVersion
        )
          this.append(
            'session.commentary.append',
            'Could you repeat that? I could not verify the answer yet.',
            `clarify_${randomUUID()}`,
          );
      });
      return;
    }
    recordLatency('teaching.supervisor_ms', Date.now() - started);
    await this.serial(async () => {
      if (
        this.stopped ||
        userGeneration !== this.userGeneration ||
        snapshot.stateVersion !== this.state.stateVersion ||
        this.buffers.user
      )
        return;
      const next = applyDecision(
        this.spec,
        this.state,
        eventId,
        text,
        decision,
      );
      if (next === this.state) {
        this.log('decision_rejected', { eventId });
        return;
      }
      await this.commit(next);
      this.log('learner_assessed', {
        eventId,
        text: text.slice(0, 1000),
        decision,
      });
      if (next.phase === 'ready' || next.phase === 'completed') {
        await this.issueStep();
        return;
      }
      if (next.phase === 'paused') {
        this.append(
          'session.instructions.append',
          'Pause teaching now and listen. Do not continue until the learner asks to resume.',
          `pause_${randomUUID()}`,
        );
        return;
      }
      if (decision.proposedAction === 'wait') return;
      const step = this.spec.steps[next.stepIndex];
      if (
        decision.proposedAction === 'give_hint' &&
        next.hintLevel !== snapshot.hintLevel
      )
        this.append(
          'session.commentary.append',
          step.hintLadder[next.hintLevel],
          `hint_${randomUUID()}`,
        );
      else if (decision.learnerIntent === 'clarification')
        this.append(
          'session.instructions.append',
          "Answer the learner's clarification briefly in English, with natural English pronunciation, using only the authorized passage and previously delivered material. Then ask the outstanding question again. Do not reveal its answer or advance.",
          `clarify_${randomUUID()}`,
        );
      else
        this.append(
          'session.commentary.append',
          `Please try the outstanding question: ${step.text}`,
          `probe_${randomUUID()}`,
        );
    });
  }
  private async pause(reason: string): Promise<void> {
    if (this.stopped || this.state.phase === 'completed') return;
    if (this.deliveryRetryTimer) clearTimeout(this.deliveryRetryTimer);
    this.deliveryRetryTimer = null;
    await this.commit({
      ...this.state,
      phase: 'paused',
      stateVersion: this.state.stateVersion + 1,
    });
    this.append(
      'session.instructions.append',
      'Pause teaching now. Listen until the learner asks to resume. Do not continue to another teaching step.',
      `pause_${randomUUID()}`,
    );
    this.log('paused', { reason });
  }
  async tick(): Promise<void> {
    return this.serial(async () => {
      if (this.stopped || !this.started || !this.controlReady) return;
      if (Date.now() - this.lastClientAt > 30000) {
        this.fail(new Error('browser activity connection lost'));
        return;
      }
      if (Date.now() - this.heartbeatAt > 10000) {
        await this.course.checkpoints.renew(
          this.learnerId,
          this.spec.number,
          this.sessionId,
        );
        this.heartbeatAt = Date.now();
      }
      if (
        ['sent', 'acknowledged', 'delivering'].includes(this.state.phase) &&
        !this.microphoneActive &&
        !this.assistantSpeaking &&
        !this.deliveryInFlight &&
        !(
          this.playbackBoundary === this.state.directive?.outputEventId &&
          this.outputText
        ) &&
        Date.now() - this.lastActionAt > 12000
      ) {
        this.retries++;
        this.log('continuation_retry', {
          attempt: this.retries,
          generatedSpeech: !!this.outputText,
        });
        if (this.retries > 2) {
          await this.pause('Teaching output did not complete');
          return;
        }
        await this.issueStep();
      }
    });
  }
  private fail(error: unknown): void {
    if (!this.stopped) this.io.fail(error);
  }
  private clearBuffers(): void {
    for (const b of Object.values(this.buffers))
      if (b?.timer) clearTimeout(b.timer);
    this.buffers = {};
  }
  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.outputGeneration++;
    this.clearBuffers();
    if (this.deliveryRetryTimer) clearTimeout(this.deliveryRetryTimer);
    this.deliveryRetryTimer = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    await this.chain;
    await this.course.checkpoints.release(
      this.learnerId,
      this.spec.number,
      this.sessionId,
    );
  }
}

export class LessonSessionManager {
  private readonly sessions = new Map<string, LessonRuntime>();
  constructor(
    readonly courseStore: CourseStore,
    private readonly supervisor: TeachingSupervisor,
  ) {}
  has(id: string): boolean {
    return this.sessions.has(id);
  }
  get(id: string): LessonRuntime | null {
    return this.sessions.get(id) ?? null;
  }
  async prepare(
    id: string,
    learner: string,
    number: number,
    io: RuntimeIO,
  ): Promise<LessonRuntime> {
    await this.courseStore.requireUnlocked(learner, number);
    const saved = await this.courseStore.checkpoints.claim(learner, number, id);
    const runtime = new LessonRuntime(
      id,
      learner,
      this.courseStore,
      saved,
      this.supervisor,
      io,
    );
    this.sessions.set(id, runtime);
    return runtime;
  }
  async forgetSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    await session?.close();
  }
}
export function lessonInstructions(
  number: number,
  originalStyle: string,
): string {
  const spec = getTeachingSpec(number);
  return [
    originalStyle,
    `You are the dedicated teacher of Language Transfer COMPLETE SPANISH LESSON ${number}: ${spec.title}.`,
    'Never ask what the learner would like to study. Wait for the application START cue.',
    'Only deliver the current authorized passage; keep its examples and discoveries in order. Do not invent examples or future teaching.',
    'The conductor owns progression and completion; delegate substantive learner answers or teaching questions to the application.',
    'While assessment is pending, listen or briefly acknowledge. Do not judge the answer or start a new passage.',
    'Never reveal a discovery answer early. Do not treat okay as an answer. Let the learner think.',
    'Handle repeat requests and brief conversational acknowledgments naturally. Substantive explanations require application direction.',
    'LESSON SPEECH LANGUAGE: Teach in English. All explanations, questions, hints, feedback and acknowledgments must be spoken in English. Never translate English script passages into Spanish.',
    'Use natural English pronunciation and English stress for narration and English comparison words. Switch to Spanish pronunciation only for explicitly identified Spanish words or phrases, then immediately return to English pronunciation. A shared cognate such as normal must sound English when discussing its English form and Spanish only when modeling its Spanish form.',
    'These lesson language rules govern every response, including after hearing a Spanish learner answer, and take priority over any earlier request to mix languages. Respect pauses and interruptions.',
    'Acknowledge interruptions naturally; the application will restore the outstanding passage or question.',
  ].join(' ');
}
