/**
 * LiveVoiceSession — browser-side WebRTC client for the GPT-Live live tutor.
 *
 * Verified flow (official OpenAI docs, 2026-10-10): the browser creates an
 * SDP offer and hands it to OUR backend (POST /api/live/session); the backend
 * performs the SDP exchange with OpenAI server-side using the project API key
 * and returns the SDP answer. The browser NEVER talks to OpenAI and NEVER
 * sees a key. Audio travels on WebRTC media tracks; the `oai-events` data
 * channel carries transcript/session events only.
 *
 * This class is framework-agnostic so it can be unit-tested with mocked
 * WebRTC primitives (see __tests__/live-voice-session.test.ts). The React
 * hook in src/hooks/useLiveSession.ts wraps it.
 */
export type LiveConnState =
  | 'idle'
  | 'requesting-mic'
  | 'creating-offer'
  | 'exchanging-sdp'
  | 'establishing-media'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed';

/**
 * STUN servers for ICE candidate gathering. A bare RTCPeerConnection only
 * produces host candidates, so on networks with symmetric NAT (common on
 * mobile data) ICE can never complete and no audio flows in either direction
 * — while the UI would still claim "connected" after SDP exchange. STUN is
 * free and fixes the common case; networks that block UDP entirely still
 * need TURN (future work, requires credentials).
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export interface LessonProgress {
  lessonNumber: number;
  stepIndex: number;
  totalSteps: number;
  phase:
    | 'ready'
    | 'authorized'
    | 'sent'
    | 'acknowledged'
    | 'delivering'
    | 'awaiting_answer'
    | 'paused'
    | 'completed';
  stateVersion?: number;
  attempts: number;
  completed: boolean;
}

export interface TranscriptEntry {
  id: number;
  speaker: 'user' | 'assistant';
  text: string;
}

export interface LiveVoiceSessionOptions {
  /** Base URL of the live-backend, e.g. https://xyz.railway.app (no trailing slash). */
  backendUrl: string;
  /** Optional verified anonymous learner capability from a previous session. */
  learnerToken?: string;
  /** Canonical numbered Language Transfer lesson, starting with Lesson 2. */
  lessonNumber?: number;
  onLessonProgress?: (progress: LessonProgress) => void;
  onLearnerToken?: (token: string) => void;
  /** Optional TURN relays; STUN alone cannot traverse some cellular/restricted networks. */
  iceServers?: RTCIceServer[];
  /** Max recovery attempts after an unexpected drop (default 3). */
  maxRetries?: number;
  /** Base backoff between recovery attempts in ms (default 1000). */
  baseBackoffMs?: number;
  /** Max time to wait for the ICE/DTLS handshake after SDP exchange (default 15000). */
  mediaConnectTimeoutMs?: number;
  fetchFn?: typeof fetch;
  createPeerConnection?: () => RTCPeerConnection;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  onStateChange?: (state: LiveConnState) => void;
  onTranscript?: (entries: TranscriptEntry[]) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  /** Fired with the local mic stream (for the user-speaking indicator). */
  onLocalStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
  sleep?: (ms: number) => Promise<void>;
}

const DATA_CHANNEL_LABEL = 'oai-events';
const ICE_GATHER_TIMEOUT_MS = 4_000;

/**
 * A failed session-mint with retry semantics. The backend marks 502s with
 * `retryable`; other statuses are classified here so the browser never burns
 * backoff cycles on failures a retry cannot fix (bad request, rejected key,
 * forbidden origin).
 */
export class MintError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, detail: unknown) {
    super(`session mint failed (HTTP ${status}): ${JSON.stringify(detail)}`);
    this.name = 'MintError';
    this.status = status;
    const body = (detail ?? {}) as { retryable?: unknown; error?: unknown };
    if (typeof body.retryable === 'boolean') {
      this.retryable = body.retryable;
    } else {
      // 'misconfigured' (rejected key) and 'disabled' (kill-switch) can never
      // be fixed by retrying; 4xx are client errors. Everything else (429,
      // 502/503/504, transient 500s) is worth a backoff retry.
      this.retryable =
        body.error !== 'misconfigured' &&
        body.error !== 'disabled' &&
        ![400, 401, 403, 404, 409, 423].includes(status);
    }
  }
}

export class LiveVoiceSession {
  private readonly opts: Required<
    Pick<
      LiveVoiceSessionOptions,
      | 'backendUrl'
      | 'iceServers'
      | 'lessonNumber'
      | 'maxRetries'
      | 'baseBackoffMs'
      | 'mediaConnectTimeoutMs'
      | 'fetchFn'
      | 'createPeerConnection'
      | 'getUserMedia'
      | 'sleep'
    >
  > &
    Pick<
      LiveVoiceSessionOptions,
      | 'onStateChange'
      | 'onTranscript'
      | 'onRemoteStream'
      | 'onLocalStream'
      | 'onError'
      | 'learnerToken'
      | 'onLearnerToken'
      | 'onLessonProgress'
    >;

  private state: LiveConnState = 'idle';
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private sessionId: string | null = null;
  private accessToken: string | null = null;
  private intentionalStop = false;
  private retryCount = 0;
  private unexpectedClosures = 0;
  private entries: TranscriptEntry[] = [];
  private nextEntryId = 1;
  private latestOutputEventId: string | undefined;
  private latestOutputEndMs = -1;
  private captionFragments = new Map<
    number,
    Array<{ start: number; text: string }>
  >();
  private activitySeq = 0;
  private remoteAudioObserved = false;
  private lastAudioAt = 0;
  private lastOutputAt = 0;
  private captionEvents = new Set<string>();
  private captionEnds: Partial<
    Record<'user' | 'assistant', { end: number; entry: TranscriptEntry }>
  > = {};

  constructor(opts: LiveVoiceSessionOptions) {
    if (!opts.backendUrl) {
      throw new Error(
        'LiveVoiceSession requires a backendUrl (set NEXT_PUBLIC_LIVE_BACKEND_URL)',
      );
    }
    this.opts = {
      backendUrl: opts.backendUrl.replace(/\/+$/, ''),
      learnerToken: opts.learnerToken,
      lessonNumber: opts.lessonNumber ?? -1,
      onLessonProgress: opts.onLessonProgress,
      onLearnerToken: opts.onLearnerToken,
      iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
      maxRetries: opts.maxRetries ?? 3,
      baseBackoffMs: opts.baseBackoffMs ?? 1_000,
      mediaConnectTimeoutMs: opts.mediaConnectTimeoutMs ?? 15_000,
      fetchFn: opts.fetchFn ?? fetch.bind(globalThis),
      createPeerConnection:
        opts.createPeerConnection ??
        (() =>
          new RTCPeerConnection({
            iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
          })),
      getUserMedia:
        opts.getUserMedia ??
        ((constraints) => navigator.mediaDevices.getUserMedia(constraints)),
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      onStateChange: opts.onStateChange,
      onTranscript: opts.onTranscript,
      onRemoteStream: opts.onRemoteStream,
      onLocalStream: opts.onLocalStream,
      onError: opts.onError,
    };
  }

  getState(): LiveConnState {
    return this.state;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Start (or restart) the voice session. */
  async start(): Promise<void> {
    if (
      this.state !== 'idle' &&
      this.state !== 'failed' &&
      this.state !== 'closed'
    ) {
      return; // already starting / running
    }
    this.intentionalStop = false;
    this.retryCount = 0;
    this.unexpectedClosures = 0;
    await this.connectOnce();
  }

  /** Graceful stop: tell the backend to close the Live session, then tear down WebRTC. */
  async stop(): Promise<void> {
    this.intentionalStop = true;
    const id = this.sessionId;
    const token = this.accessToken;
    this.setState('closed');
    this.teardownPeerConnection();
    if (id) {
      try {
        await this.opts.fetchFn(
          `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(id)}/close`,
          {
            method: 'POST',
            headers: token ? { authorization: `Bearer ${token}` } : {},
          },
        );
      } catch {
        // Best effort: the backend expires orphaned sessions server-side.
      }
      this.sessionId = null;
      this.accessToken = null;
    }
  }

  private setState(next: LiveConnState): void {
    this.state = next;
    this.opts.onStateChange?.(next);
  }

  private async connectOnce(): Promise<void> {
    try {
      this.setState('requesting-mic');
      this.micStream = await this.opts.getUserMedia({ audio: true });
      this.opts.onLocalStream?.(this.micStream);

      this.setState('creating-offer');
      const pc = this.opts.createPeerConnection();
      this.pc = pc;
      this.latestOutputEventId = undefined;
      this.latestOutputEndMs = -1;
      this.remoteAudioObserved = false;
      this.captionEvents.clear();
      this.captionEnds = {};
      for (const track of this.micStream.getAudioTracks()) {
        pc.addTrack(track, this.micStream);
      }
      // The data channel MUST be created before createOffer so it is
      // negotiated in the SDP. Label is fixed by the Live API: 'oai-events'.
      const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
      this.dataChannel = dc;
      dc.onmessage = (ev) => {
        if (dc === this.dataChannel) this.handleDataChannelMessage(ev.data);
      };
      pc.ontrack = (ev) => {
        if (pc === this.pc && ev.streams[0])
          this.opts.onRemoteStream?.(ev.streams[0]);
      };
      pc.onconnectionstatechange = () => this.handleConnectionStateChange(pc);
      pc.oniceconnectionstatechange = () => {
        if (pc === this.pc && pc.iceConnectionState === 'failed') {
          // Do not start a second recovery while the initial handshake is pending.
          if (this.state === 'connected') void this.recover();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIceGathering(pc);
      const offerSdp = pc.localDescription?.sdp;
      if (!offerSdp) throw new Error('no local SDP after ICE gathering');

      this.setState('exchanging-sdp');
      const res = await this.opts.fetchFn(
        `${this.opts.backendUrl}/api/live/session`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sdp: offerSdp,
            ...(this.opts.learnerToken
              ? { learnerToken: this.opts.learnerToken }
              : {}),
            ...(this.opts.lessonNumber >= 2
              ? { lessonNumber: this.opts.lessonNumber }
              : {}),
          }),
        },
      );
      if (!res.ok) {
        const detail = await safeJson(res);
        throw new MintError(res.status, detail);
      }
      const payload = (await res.json()) as {
        session?: { id?: string; accessToken?: string };
        transport?: { sdp?: string };
        learner?: { token?: string };
      };
      const sessionId = payload.session?.id;
      const answerSdp = payload.transport?.sdp;
      if (!sessionId || !answerSdp || !payload.session?.accessToken) {
        throw new Error('backend returned a malformed session response');
      }
      this.sessionId = sessionId;
      this.accessToken = payload.session.accessToken;
      if (payload.learner?.token) {
        this.opts.learnerToken = payload.learner.token;
        this.opts.onLearnerToken?.(payload.learner.token);
      }
      if (this.intentionalStop) {
        await this.closeOrphanedSession();
        return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      // SDP exchange is not a working call: wait until ICE/DTLS actually
      // connects before claiming 'connected', so the UI never shows a live
      // session while audio cannot flow.
      this.setState('establishing-media');
      await this.waitForMediaConnected(pc);
      // The tutor must not speak until the authored lesson is ready and audio works.
      if (this.opts.lessonNumber >= 2) await this.beginLesson();
      this.retryCount = 0;
      this.setState('connected');
    } catch (err) {
      await this.handleConnectFailure(err);
    }
  }

  private async beginLesson(): Promise<void> {
    if (!this.sessionId || !this.accessToken)
      throw new Error('lesson session not minted');
    const url = `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(this.sessionId)}/start`;
    // Browser media can finish connecting before the Railway sideband receives session.started.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (this.intentionalStop) return;
      const res = await this.opts.fetchFn(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.accessToken}` },
      });
      if (res.ok) {
        await this.readLessonProgress();
        return;
      }
      if (res.status !== 409) {
        throw new MintError(res.status, await safeJson(res));
      }
      await this.opts.sleep(150);
    }
    throw new Error('Teaching session did not become ready. Please try again.');
  }

  async readLessonProgress(): Promise<LessonProgress | null> {
    if (this.opts.lessonNumber < 2 || !this.sessionId || !this.accessToken)
      return null;
    const res = await this.opts.fetchFn(
      `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(this.sessionId)}/progress`,
      { headers: { authorization: `Bearer ${this.accessToken}` } },
    );
    if (!res.ok) return null;
    const progress = (await res.json()) as LessonProgress;
    this.opts.onLessonProgress?.(progress);
    return progress;
  }

  async evaluationTrace(): Promise<unknown> {
    if (!this.sessionId || !this.accessToken)
      throw new Error('No active teaching session');
    const result = await this.opts.fetchFn(
      `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(this.sessionId)}/trace`,
      {
        headers: { authorization: `Bearer ${this.accessToken}` },
      },
    );
    if (!result.ok) throw new Error('Could not retrieve teaching trace');
    return result.json();
  }

  /** Browser observation of media activity, not a claim that the learner listened. */
  async reportActivity(
    speaker: 'user' | 'assistant',
    speaking: boolean,
    playing = false,
  ): Promise<void> {
    if (this.opts.lessonNumber < 2 || !this.sessionId || !this.accessToken)
      return;
    if (speaker === 'assistant' && speaking && playing) {
      this.remoteAudioObserved = true;
      this.lastAudioAt = Date.now();
    }
    const outputEventId =
      speaker === 'assistant' &&
      this.remoteAudioObserved &&
      this.lastAudioAt >= this.lastOutputAt - 1500 &&
      Date.now() - this.lastAudioAt < 3000
        ? this.latestOutputEventId
        : undefined;
    const id = this.sessionId;
    const result = await this.opts.fetchFn(
      `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(id)}/activity`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          speaker,
          speaking,
          playing,
          seq: ++this.activitySeq,
          ...(outputEventId ? { outputEventId } : {}),
        }),
      },
    );
    if (!result.ok && this.sessionId === id && this.state === 'connected')
      void this.recover();
  }

  private async handleConnectFailure(err: unknown): Promise<void> {
    const error = err instanceof Error ? err : new Error(String(err));
    this.teardownPeerConnection();
    await this.closeOrphanedSession();
    if (this.intentionalStop) return;
    // Fail fast on errors a retry cannot fix (bad request, rejected key,
    // forbidden origin) — don't burn backoff cycles or confuse the learner.
    if (error instanceof MintError && !error.retryable) {
      this.setState('failed');
      this.opts.onError?.(error);
      return;
    }
    if (this.retryCount < this.opts.maxRetries) {
      this.retryCount += 1;
      this.setState('reconnecting');
      const backoff = this.opts.baseBackoffMs * 2 ** (this.retryCount - 1);
      await this.opts.sleep(backoff);
      if (this.intentionalStop) return;
      await this.connectOnce();
      return;
    }
    this.setState('failed');
    this.opts.onError?.(error);
  }

  private handleConnectionStateChange(pc: RTCPeerConnection): void {
    if (pc !== this.pc) return; // stale peer connection
    if (this.intentionalStop) return;
    const cs = pc.connectionState;
    // During initial ICE/DTLS negotiation, waitForMediaConnected owns errors.
    // Retrying here races its pending promise and can orphan new sessions.
    if (this.state !== 'connected') return;
    if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
      // Unexpected drop mid-session: full re-connect (new backend session).
      void this.recover();
    }
  }

  private async recover(): Promise<void> {
    if (this.intentionalStop) return;
    if (this.state === 'reconnecting') return;
    this.unexpectedClosures += 1;
    if (this.unexpectedClosures > this.opts.maxRetries) {
      this.setState('failed');
      this.opts.onError?.(
        new Error(
          'The tutor connection ended unexpectedly. Tap Resume lesson to continue from your saved step.',
        ),
      );
      this.teardownPeerConnection();
      await this.closeOrphanedSession();
      return;
    }
    this.setState('reconnecting');
    const oldId = this.sessionId;
    const oldToken = this.accessToken;
    this.sessionId = null;
    this.accessToken = null;
    this.teardownPeerConnection();
    // Best effort: release the orphaned backend session; it expires server-side anyway.
    if (oldId) {
      await this.opts
        .fetchFn(
          `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(oldId)}/close`,
          {
            method: 'POST',
            headers: oldToken ? { authorization: `Bearer ${oldToken}` } : {},
          },
        )
        .catch(() => undefined);
    }
    await this.handleConnectFailure(new Error('webrtc connection lost'));
  }

  /** Close a Live session minted before a failed SDP/ICE handshake. */
  private async closeOrphanedSession(): Promise<void> {
    const id = this.sessionId;
    const token = this.accessToken;
    this.sessionId = null;
    this.accessToken = null;
    if (!id) return;
    try {
      await this.opts.fetchFn(
        `${this.opts.backendUrl}/api/live/session/${encodeURIComponent(id)}/close`,
        {
          method: 'POST',
          headers: token ? { authorization: `Bearer ${token}` } : {},
        },
      );
    } catch {
      // Best effort: backend will close the session if the network has gone.
    }
  }

  private teardownPeerConnection(): void {
    // The browser primary channel can still close the provider session when
    // the trusted sideband has failed. Closing only local media would orphan it.
    if (this.dataChannel?.readyState === 'open') {
      try {
        this.dataChannel.send(
          JSON.stringify({
            type: 'session.close',
            event_id: `browser_close_${Date.now()}`,
          }),
        );
      } catch {
        /* connection may already be gone */
      }
    }
    try {
      this.dataChannel?.close();
    } catch {
      // ignore teardown errors
    }
    this.dataChannel = null;
    const pc = this.pc;
    this.pc = null;
    try {
      pc?.close();
    } catch {
      // ignore teardown errors
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) track.stop();
      this.micStream = null;
    }
  }

  /**
   * Resolves once the peer connection's ICE/DTLS handshake completes, so
   * 'connected' always means media can actually flow. Rejects (retryable via
   * handleConnectFailure) when ICE fails outright or times out — e.g. a
   * network that blocks WebRTC.
   */
  private waitForMediaConnected(pc: RTCPeerConnection): Promise<void> {
    if (pc.connectionState === 'connected') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(this.mediaFailureMessage(pc, 'timed out')));
      }, this.opts.mediaConnectTimeoutMs);
      const onChange = () => {
        if (pc.connectionState === 'connected') {
          cleanup();
          resolve();
        } else if (pc.connectionState === 'failed') {
          cleanup();
          reject(new Error(this.mediaFailureMessage(pc, 'failed')));
        } else if (pc.iceConnectionState === 'failed') {
          cleanup();
          reject(new Error(this.mediaFailureMessage(pc, 'failed')));
        } else if (pc.connectionState === 'closed') {
          // Torn down mid-handshake (user stopped, or recovery kicked in):
          // fail fast instead of hanging until the timeout.
          cleanup();
          reject(
            new Error('Audio connection closed before it was established.'),
          );
        }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        pc.removeEventListener('connectionstatechange', onChange);
      };
      pc.addEventListener('connectionstatechange', onChange);
    });
  }

  private mediaFailureMessage(pc: RTCPeerConnection, reason: string): string {
    const hasRelay = this.opts.iceServers.some((server) =>
      [server.urls]
        .flat()
        .some((url) => url.startsWith('turn:') || url.startsWith('turns:')),
    );
    return (
      `Audio connection ${reason} (ICE: ${pc.iceConnectionState}, peer: ${pc.connectionState}, TURN configured: ${hasRelay ? 'yes' : 'no'}). ` +
      'The network may be blocking real-time audio. Try Wi-Fi or a different network.'
    );
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          finish();
        }
      };
    });
  }

  private handleDataChannelMessage(data: unknown): void {
    let event: {
      type?: string;
      delta?: string;
      event_id?: string;
      start_ms?: number;
      end_ms?: number;
    } | null = null;
    try {
      event = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    if (!event || typeof event.type !== 'string') return;
    if (event.event_id && this.captionEvents.has(event.event_id)) return;
    if (event.event_id) this.captionEvents.add(event.event_id);
    if (this.captionEvents.size > 4096)
      this.captionEvents.delete(this.captionEvents.values().next().value!);
    if (event.type === 'session.input_transcript.delta') {
      this.appendDelta('user', event.delta ?? '', event.start_ms, event.end_ms);
    } else if (event.type === 'session.output_transcript.delta') {
      if (
        (event.end_ms ?? this.latestOutputEndMs + 1) >= this.latestOutputEndMs
      ) {
        this.latestOutputEventId = event.event_id;
        this.latestOutputEndMs = event.end_ms ?? this.latestOutputEndMs + 1;
        this.lastOutputAt = Date.now();
      }
      this.appendDelta(
        'assistant',
        event.delta ?? '',
        event.start_ms,
        event.end_ms,
      );
    } else if (event.type === 'session.closed' && this.state === 'connected') {
      void this.recover();
    }
    // Other data-channel events (session.started/updated, usage, delegation)
    // are observed here in PR 1 and acted on in later PRs.
  }

  private appendDelta(
    speaker: 'user' | 'assistant',
    delta: string,
    startMs?: number,
    endMs?: number,
  ): void {
    if (!delta) return;
    // Keep each speaker's captions independent during overlapping speech.
    const prior = this.captionEnds[speaker];
    const last =
      startMs !== undefined && prior && startMs - prior.end <= 1500
        ? prior.entry
        : this.entries[this.entries.length - 1]?.speaker === speaker
          ? this.entries[this.entries.length - 1]
          : undefined;
    if (last) last.text += delta;
    else this.entries.push({ id: this.nextEntryId++, speaker, text: delta });
    const entry = last ?? this.entries[this.entries.length - 1];
    if (startMs !== undefined) {
      const fragments = this.captionFragments.get(entry.id) ?? [];
      fragments.push({ start: startMs, text: delta });
      fragments.sort((a, b) => a.start - b.start);
      entry.text = fragments.map((f) => f.text).join('');
      this.captionFragments.set(entry.id, fragments);
    }
    if (endMs !== undefined)
      this.captionEnds[speaker] = {
        end: Math.max(prior?.end ?? 0, endMs),
        entry,
      };
    this.opts.onTranscript?.([...this.entries]);
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
