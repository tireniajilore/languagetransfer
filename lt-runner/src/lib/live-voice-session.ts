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

export interface TranscriptEntry {
  id: number;
  speaker: 'user' | 'assistant';
  text: string;
}

export interface LiveVoiceSessionOptions {
  /** Base URL of the live-backend, e.g. https://xyz.railway.app (no trailing slash). */
  backendUrl: string;
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
        ![400, 401, 403, 404].includes(status);
    }
  }
}

export class LiveVoiceSession {
  private readonly opts: Required<
    Pick<
      LiveVoiceSessionOptions,
      | 'backendUrl'
      | 'iceServers'
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
      'onStateChange' | 'onTranscript' | 'onRemoteStream' | 'onLocalStream' | 'onError'
    >;

  private state: LiveConnState = 'idle';
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private sessionId: string | null = null;
  private intentionalStop = false;
  private retryCount = 0;
  private entries: TranscriptEntry[] = [];
  private nextEntryId = 1;

  constructor(opts: LiveVoiceSessionOptions) {
    if (!opts.backendUrl) {
      throw new Error('LiveVoiceSession requires a backendUrl (set NEXT_PUBLIC_LIVE_BACKEND_URL)');
    }
    this.opts = {
      backendUrl: opts.backendUrl.replace(/\/+$/, ''),
      iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
      maxRetries: opts.maxRetries ?? 3,
      baseBackoffMs: opts.baseBackoffMs ?? 1_000,
      mediaConnectTimeoutMs: opts.mediaConnectTimeoutMs ?? 15_000,
      fetchFn: opts.fetchFn ?? fetch.bind(globalThis),
      createPeerConnection:
        opts.createPeerConnection ?? (() => new RTCPeerConnection({ iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS })),
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
    if (this.state !== 'idle' && this.state !== 'failed' && this.state !== 'closed') {
      return; // already starting / running
    }
    this.intentionalStop = false;
    this.retryCount = 0;
    await this.connectOnce();
  }

  /** Graceful stop: tell the backend to close the Live session, then tear down WebRTC. */
  async stop(): Promise<void> {
    this.intentionalStop = true;
    const id = this.sessionId;
    this.setState('closed');
    this.teardownPeerConnection();
    if (id) {
      try {
        await this.opts.fetchFn(`${this.opts.backendUrl}/api/live/session/${encodeURIComponent(id)}/close`, {
          method: 'POST',
        });
      } catch {
        // Best effort: the backend expires orphaned sessions server-side.
      }
      this.sessionId = null;
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
      for (const track of this.micStream.getAudioTracks()) {
        pc.addTrack(track, this.micStream);
      }
      // The data channel MUST be created before createOffer so it is
      // negotiated in the SDP. Label is fixed by the Live API: 'oai-events'.
      const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
      this.dataChannel = dc;
      dc.onmessage = (ev) => this.handleDataChannelMessage(ev.data);
      pc.ontrack = (ev) => {
        if (ev.streams[0]) this.opts.onRemoteStream?.(ev.streams[0]);
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
      const res = await this.opts.fetchFn(`${this.opts.backendUrl}/api/live/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdp: offerSdp }),
      });
      if (!res.ok) {
        const detail = await safeJson(res);
        throw new MintError(res.status, detail);
      }
      const payload = (await res.json()) as {
        session?: { id?: string };
        transport?: { sdp?: string };
      };
      const sessionId = payload.session?.id;
      const answerSdp = payload.transport?.sdp;
      if (!sessionId || !answerSdp) {
        throw new Error('backend returned a malformed session response');
      }
      this.sessionId = sessionId;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      // SDP exchange is not a working call: wait until ICE/DTLS actually
      // connects before claiming 'connected', so the UI never shows a live
      // session while audio cannot flow.
      this.setState('establishing-media');
      await this.waitForMediaConnected(pc);
      this.retryCount = 0;
      this.setState('connected');
    } catch (err) {
      await this.handleConnectFailure(err);
    }
  }

  private async handleConnectFailure(err: unknown): Promise<void> {
    const error = err instanceof Error ? err : new Error(String(err));
    this.teardownPeerConnection();
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
    if (cs === 'failed' || cs === 'disconnected') {
      // Unexpected drop mid-session: full re-connect (new backend session).
      void this.recover();
    }
  }

  private async recover(): Promise<void> {
    if (this.intentionalStop) return;
    if (this.state === 'reconnecting') return;
    const oldId = this.sessionId;
    this.sessionId = null;
    this.teardownPeerConnection();
    // Best effort: release the orphaned backend session; it expires server-side anyway.
    if (oldId) {
      void this.opts
        .fetchFn(`${this.opts.backendUrl}/api/live/session/${encodeURIComponent(oldId)}/close`, {
          method: 'POST',
        })
        .catch(() => undefined);
    }
    await this.handleConnectFailure(new Error('webrtc connection lost'));
  }

  private teardownPeerConnection(): void {
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
          reject(new Error('Audio connection closed before it was established.'));
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
      [server.urls].flat().some((url) => url.startsWith('turn:') || url.startsWith('turns:')),
    );
    return `Audio connection ${reason} (ICE: ${pc.iceConnectionState}, peer: ${pc.connectionState}, TURN configured: ${hasRelay ? 'yes' : 'no'}). ` +
      'The network may be blocking real-time audio. Try Wi-Fi or a different network.';
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {    if (pc.iceGatheringState === 'complete') return Promise.resolve();
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
    let event: { type?: string; delta?: string } | null = null;
    try {
      event = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    if (!event || typeof event.type !== 'string') return;
    if (event.type === 'session.input_transcript.delta') {
      this.appendDelta('user', event.delta ?? '');
    } else if (event.type === 'session.output_transcript.delta') {
      this.appendDelta('assistant', event.delta ?? '');
    }
    // Other data-channel events (session.started/updated, usage, delegation)
    // are observed here in PR 1 and acted on in later PRs.
  }

  private appendDelta(speaker: 'user' | 'assistant', delta: string): void {
    if (!delta) return;
    const last = this.entries[this.entries.length - 1];
    if (last && last.speaker === speaker) {
      last.text += delta;
    } else {
      this.entries.push({ id: this.nextEntryId++, speaker, text: delta });
    }
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
