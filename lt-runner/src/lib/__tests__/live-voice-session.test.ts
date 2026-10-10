import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ICE_SERVERS,
  LiveConnState,
  LiveVoiceSession,
  TranscriptEntry,
} from '../live-voice-session';

/* ---------- Fakes ---------- */

class FakeDataChannel {
  label: string;
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  constructor(label: string) {
    this.label = label;
  }
  close() {
    this.closed = true;
  }
  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeMediaStream {
  private tracks = [new FakeTrack()];
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakePeerConnection {
  calls: string[] = [];
  dataChannels: FakeDataChannel[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = 'complete';
  connectionState: RTCPeerConnectionState = 'new';
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  ontrack: ((ev: { streams: FakeMediaStream[] }) => void) | null = null;
  closed = false;
  private listeners: Record<string, (() => void)[]> = {};

  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }

  createDataChannel(label: string): RTCDataChannel {
    this.calls.push(`createDataChannel:${label}`);
    const dc = new FakeDataChannel(label);
    this.dataChannels.push(dc);
    return dc as unknown as RTCDataChannel;
  }
  async createOffer(): Promise<{ type: string; sdp: string }> {
    this.calls.push('createOffer');
    return { type: 'offer', sdp: 'v=0\r\nfake-offer' };
  }
  async setLocalDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.calls.push('setLocalDescription');
    this.localDescription = desc;
  }
  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.calls.push('setRemoteDescription');
    this.remoteDescription = desc;
  }
  addTrack() {
    this.calls.push('addTrack');
  }
  close() {
    this.calls.push('close');
    this.closed = true;
  }
  simulateConnectionState(cs: RTCPeerConnectionState) {
    this.connectionState = cs;
    this.onconnectionstatechange?.();
    for (const fn of this.listeners['connectionstatechange'] ?? []) fn();
  }
}

interface FetchCall {
  url: string;
  body: unknown;
  method: string;
}

function makeFetch(
  impl: (url: string, body: unknown) => { status: number; json: unknown },
) {
  const calls: FetchCall[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body, method: init?.method ?? 'GET' });
    const { status, json } = impl(url, body);
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function mintResponder(sessionId: string, answerSdp = 'v=0\r\nfake-answer') {
  return () => ({
    status: 201,
    json: { session: { id: sessionId }, transport: { type: 'webrtc', sdp: answerSdp } },
  });
}

/* ---------- Setup ---------- */

function setup(opts?: {
  fetchImpl?: (url: string, body: unknown) => { status: number; json: unknown };
  maxRetries?: number;
}) {
  const states: LiveConnState[] = [];
  const transcripts: TranscriptEntry[][] = [];
  const remoteStreams: unknown[] = [];
  const errors: Error[] = [];
  const pcs: FakePeerConnection[] = [];
  const sleeps: number[] = [];
  const stream = new FakeMediaStream();
  const { fetchFn, calls } = makeFetch(
    opts?.fetchImpl ?? mintResponder('live_1'),
  );
  const session = new LiveVoiceSession({
    backendUrl: 'https://backend.example.com/',
    fetchFn,
    createPeerConnection: () => {
      const pc = new FakePeerConnection();
      pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    },
    getUserMedia: async () => stream as unknown as MediaStream,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    maxRetries: opts?.maxRetries,
    onStateChange: (s) => states.push(s),
    onTranscript: (e) => transcripts.push(e),
    onRemoteStream: (s) => remoteStreams.push(s),
    onError: (e) => errors.push(e),
  });
  return { session, states, transcripts, remoteStreams, errors, pcs, sleeps, fetchCalls: calls, stream };
}

/**
 * Drives a full start through to ICE-connected: start() now waits for the
 * media handshake, so tests must simulate the peer connection reaching
 * 'connected' (as a real network would) before awaiting start().
 */
async function startConnected(setupResult: {
  session: LiveVoiceSession;
  pcs: FakePeerConnection[];
}): Promise<void> {
  const started = setupResult.session.start();
  await vi.waitFor(() => expect(setupResult.pcs.length).toBe(1));
  setupResult.pcs[setupResult.pcs.length - 1].simulateConnectionState('connected');
  await started;
}

describe('LiveVoiceSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws without a backendUrl', () => {
    expect(() => new LiveVoiceSession({ backendUrl: '' })).toThrow(/backendUrl/);
  });

  it('runs the full SDP exchange: data channel before offer, answer applied', async () => {
    const { session, states, pcs, fetchCalls } = setup();
    await startConnected({ session, pcs });

    expect(states).toEqual([
      'requesting-mic',
      'creating-offer',
      'exchanging-sdp',
      'establishing-media',
      'connected',
    ]);
    const pc = pcs[0];
    // Data channel negotiated in the offer: created BEFORE createOffer.
    expect(pc.calls.indexOf('createDataChannel:oai-events')).toBeLessThan(
      pc.calls.indexOf('createOffer'),
    );
    expect(pc.calls).toContain('addTrack');
    expect(pc.calls).toContain('setLocalDescription');
    // Backend received the offer SDP; browser applied the answer SDP.
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://backend.example.com/api/live/session');
    expect(fetchCalls[0].body).toEqual({ sdp: 'v=0\r\nfake-offer' });
    expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'v=0\r\nfake-answer' });
    expect(session.getSessionId()).toBe('live_1');
    expect(session.getState()).toBe('connected');
  });

  it('delivers the remote audio stream to onRemoteStream', async () => {
    const { session, pcs, remoteStreams } = setup();
    await startConnected({ session, pcs });
    const remote = new FakeMediaStream();
    pcs[0].ontrack?.({ streams: [remote] });
    expect(remoteStreams).toHaveLength(1);
  });

  it('accumulates transcript deltas per speaker from the oai-events channel', async () => {
    const { session, pcs, transcripts } = setup();
    await startConnected({ session, pcs });
    const dc = pcs[0].dataChannels[0];
    dc.emitMessage({ type: 'session.output_transcript.delta', delta: 'Hola' });
    dc.emitMessage({ type: 'session.output_transcript.delta', delta: ', ¿cómo estás?' });
    dc.emitMessage({ type: 'session.input_transcript.delta', delta: 'Bien' });
    dc.emitMessage({ type: 'session.input_transcript.delta', delta: ', gracias' });
    dc.emitMessage({ type: 'session.unknown.future', foo: 1 }); // ignored, must not crash

    const latest = transcripts[transcripts.length - 1];
    expect(latest).toEqual([
      { id: 1, speaker: 'assistant', text: 'Hola, ¿cómo estás?' },
      { id: 2, speaker: 'user', text: 'Bien, gracias' },
    ]);
  });

  it('ignores malformed data-channel frames', async () => {
    const { session, pcs, transcripts } = setup();
    await startConnected({ session, pcs });
    const dc = pcs[0].dataChannels[0];
    dc.onmessage?.({ data: 'not json' });
    expect(transcripts).toHaveLength(0);
  });

  it('retries with backoff on mint failure, then surfaces failed', async () => {
    let attempts = 0;
    const { session, states, errors, sleeps } = setup({
      maxRetries: 2,
      fetchImpl: () => {
        attempts += 1;
        return { status: 502, json: { error: 'live_api_error' } };
      },
    });
    await session.start();
    expect(attempts).toBe(3); // initial + 2 retries
    expect(sleeps).toEqual([1_000, 2_000]); // exponential backoff
    expect(states).toContain('reconnecting');
    expect(states[states.length - 1]).toBe('failed');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('502');
  });

  it('does not retry non-retryable mint failures (rejected key, bad origin)', async () => {
    for (const failure of [
      { status: 500, json: { error: 'misconfigured', detail: 'OpenAI key rejected' } },
      { status: 403, json: { error: 'forbidden' } },
      { status: 400, json: { error: 'invalid_request' } },
    ]) {
      let attempts = 0;
      const { session, states, errors, sleeps } = setup({
        maxRetries: 3,
        fetchImpl: () => {
          attempts += 1;
          return failure;
        },
      });
      await session.start();
      expect(attempts).toBe(1); // fail fast, no backoff burned
      expect(sleeps).toEqual([]);
      expect(states).not.toContain('reconnecting');
      expect(states[states.length - 1]).toBe('failed');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain(String(failure.status));
    }
  });

  it('recovers from an unexpected mid-session drop with a fresh session', async () => {
    let mints = 0;
    const { session, states, pcs, fetchCalls, sleeps } = setup({
      fetchImpl: (url) => {
        if (url.endsWith('/close')) return { status: 200, json: { closed: true } };
        mints += 1;
        return { status: 201, json: { session: { id: `live_${mints}` }, transport: { type: 'webrtc', sdp: 'v=0\r\nfake-answer' } } };
      },
    });
    await startConnected({ session, pcs });
    expect(session.getSessionId()).toBe('live_1');

    pcs[0].simulateConnectionState('failed');
    // recovery runs async (sleep is mocked); the fresh peer connection also
    // needs its ICE handshake simulated before 'connected' is reported.
    await vi.waitFor(() => expect(pcs.length).toBe(2));
    pcs[1].simulateConnectionState('connected');
    await vi.waitFor(() => expect(session.getState()).toBe('connected'), { timeout: 2_000 });

    expect(mints).toBe(2); // a brand-new backend session was minted
    expect(session.getSessionId()).toBe('live_2');
    expect(pcs).toHaveLength(2);
    expect(pcs[0].closed).toBe(true);
    // best-effort close of the orphaned first session
    expect(fetchCalls.some((c) => c.url.endsWith('/api/live/session/live_1/close'))).toBe(true);
    expect(states).toContain('reconnecting');
    expect(sleeps).toEqual([1_000]);
  });

  it('stop() performs the graceful close and tears down WebRTC', async () => {
    const { session, states, pcs, fetchCalls, stream } = setup();
    await startConnected({ session, pcs });
    await session.stop();

    expect(states[states.length - 1]).toBe('closed');
    expect(pcs[0].closed).toBe(true);
    expect(pcs[0].dataChannels[0].closed).toBe(true);
    expect(stream.getTracks()[0].stopped).toBe(true);
    const closeCall = fetchCalls.find((c) => c.url.endsWith('/api/live/session/live_1/close'));
    expect(closeCall?.method).toBe('POST');
    expect(session.getSessionId()).toBeNull();
  });

  it('stop() on an idle session is a safe no-op', async () => {
    const { session, states, fetchCalls } = setup();
    await session.stop();
    expect(states).toEqual(['closed']);
    expect(fetchCalls).toHaveLength(0);
  });

  it('does not recover after an intentional stop', async () => {
    const { session, pcs } = setup();
    await startConnected({ session, pcs });
    await session.stop();
    const pcCount = pcs.length;
    pcs[0].simulateConnectionState('failed');
    await new Promise((r) => setTimeout(r, 20));
    expect(pcs).toHaveLength(pcCount); // no new peer connection
    expect(session.getState()).toBe('closed');
  });

  it('does not report connected until ICE actually connects', async () => {
    const { session, states, pcs } = setup();
    const started = session.start();
    // SDP exchange completes but ICE never connects: the UI must stay in
    // 'establishing-media' and never claim 'connected'.
    await vi.waitFor(() => expect(pcs.length).toBe(1));
    await vi.waitFor(() =>
      expect(states).toContain('establishing-media'),
    );
    expect(session.getState()).toBe('establishing-media');
    expect(states).not.toContain('connected');
    // Now let ICE complete: only then is 'connected' reported.
    pcs[0].simulateConnectionState('connected');
    await started;
    expect(session.getState()).toBe('connected');
  });

  it('surfaces a clear, actionable error when ICE fails during establishment', async () => {
    const { session, states, pcs, errors } = setup({ maxRetries: 0 });
    const started = session.start();
    await vi.waitFor(() => expect(pcs.length).toBe(1));
    pcs[0].simulateConnectionState('failed');
    await started;
    expect(session.getState()).toBe('failed');
    expect(states).toContain('establishing-media');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[errors.length - 1].message).toMatch(/blocking real-time audio/);
  });

  it('configures STUN ICE servers on the default peer connection', async () => {
    let captured: RTCConfiguration | undefined;
    const g = globalThis as unknown as { RTCPeerConnection?: unknown };
    const prev = g.RTCPeerConnection;
    g.RTCPeerConnection = class extends FakePeerConnection {
      constructor(config?: RTCConfiguration) {
        super();
        captured = config;
      }
    };
    try {
      const stream = new FakeMediaStream();
      const { fetchFn } = makeFetch(mintResponder('live_9'));
      const errors: Error[] = [];
      const session = new LiveVoiceSession({
        backendUrl: 'https://backend.example.com/',
        fetchFn,
        getUserMedia: async () => stream as unknown as MediaStream,
        sleep: async () => {},
        maxRetries: 0,
        mediaConnectTimeoutMs: 20,
        onError: (e) => errors.push(e),
      });
      await session.start(); // resolves after the (fast) ICE timeout → 'failed'
      expect(captured?.iceServers).toEqual(DEFAULT_ICE_SERVERS);
      expect(
        (captured?.iceServers?.[0] as RTCIceServer)?.urls,
      ).toContain('stun:');
      expect(session.getState()).toBe('failed');
    } finally {
      g.RTCPeerConnection = prev;
    }
  });
});
