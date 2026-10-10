/**
 * Sideband connection to a GPT-Live session.
 *
 * Verified flow (official docs, 2026-10-10): the server opens
 * wss://api.openai.com/v1/live/sessions/{session_id}/attach with
 * `Authorization: Bearer $OPENAI_API_KEY` to observe and control the same
 * session the browser connected to over WebRTC. Audio travels on WebRTC media
 * tracks only; the sideband carries transcript/session events and commands
 * (e.g. `session.close`, `session.instructions.append`).
 *
 * PR 1 responsibilities: observe lifecycle events (session.started,
 * session.closed), log transcript deltas, reconnect on unexpected drops, and
 * perform a graceful close handshake. Pedagogical steering over this channel
 * lands in PR 3.
 */

export type SidebandState =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'failed';

export interface SidebandEventHandlers {
  onReady(sessionId: string): void;
  onTranscriptDelta(
    sessionId: string,
    speaker: 'user' | 'assistant',
    delta: string,
  ): void;
  onClosed(sessionId: string, reason?: string): void;
  onError(sessionId: string, error: unknown): void;
  onInfo?(sessionId: string, message: string): void;
}

/** Minimal WebSocket surface we need; injectable for tests. */
export interface WebSocketLike {
  on(event: 'open' | 'message' | 'close' | 'error', cb: (...args: never[]) => void): void;
  send(data: string): void;
  close(): void;
}

export type WsFactory = (
  url: string,
  opts: { headers: Record<string, string> },
) => WebSocketLike;

export interface Clock {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const defaultClock: Clock = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id as NodeJS.Timeout),
};

export interface SidebandOptions {
  sessionId: string;
  apiKey: string;
  baseUrl: string;
  handlers: SidebandEventHandlers;
  wsFactory: WsFactory;
  maxReconnectAttempts?: number;
  baseBackoffMs?: number;
  closeTimeoutMs?: number;
  clock?: Clock;
}

const TRANSCRIPT_USER = 'session.input_transcript.delta';
const TRANSCRIPT_ASSISTANT = 'session.output_transcript.delta';

export class SidebandConnection {
  private readonly opts: SidebandOptions;
  private readonly clock: Clock;
  private ws: WebSocketLike | null = null;
  private state: SidebandState = 'connecting';
  private reconnectAttempts = 0;
  private reconnectTimer: unknown = null;
  private closeTimer: unknown = null;
  private closeRequested = false;
  private closedResolver: (() => void) | null = null;
  /** Idempotency guard: destroy() and close() must be safe to call repeatedly. */
  private cleanedUp = false;

  constructor(opts: SidebandOptions) {
    this.opts = opts;
    this.clock = opts.clock ?? defaultClock;
  }

  getState(): SidebandState {
    return this.state;
  }

  get reconnectCount(): number {
    return this.reconnectAttempts;
  }

  /** Open the sideband. Safe to call once; repeated calls are no-ops. */
  attach(): void {
    if (this.ws || this.state === 'closed' || this.state === 'failed') return;
    const url = `${this.opts.baseUrl}/v1/live/sessions/${encodeURIComponent(
      this.opts.sessionId,
    )}/attach`;
    this.setState('connecting');
    const ws = this.opts.wsFactory(url, {
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
    });
    this.ws = ws;
    ws.on('open', () => {
      // session.started arrives as a server event; connection open alone is not ready.
      this.setState('open');
      this.opts.handlers.onInfo?.(this.opts.sessionId, 'sideband connected');
    });
    ws.on('message', (data: unknown) => this.handleMessage(data));
    ws.on('error', (err: unknown) => {
      this.opts.handlers.onError(this.opts.sessionId, err);
      this.handleDrop('error');
    });
    ws.on('close', () => this.handleDrop('close'));
  }

  /**
   * Graceful close: send `session.close`, wait for `session.closed` (or a
   * timeout), then clean up. Idempotent.
   */
  async close(): Promise<void> {
    if (this.cleanedUp) return;
    this.closeRequested = true;
    this.clearReconnectTimer();
    const promise = new Promise<void>((resolve) => {
      this.closedResolver = resolve;
    });
    try {
      this.ws?.send(JSON.stringify({ type: 'session.close' }));
    } catch (err) {
      this.opts.handlers.onError(this.opts.sessionId, err);
    }
    const timeoutMs = this.opts.closeTimeoutMs ?? 5_000;
    this.closeTimer = this.clock.setTimeout(() => {
      this.finishClose('close_timeout');
    }, timeoutMs);
    await promise;
  }

  /** Hard teardown without the close handshake. Idempotent. */
  destroy(): void {
    this.closeRequested = true;
    this.finishClose('destroyed');
  }

  private finishClose(reason: string): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.clearReconnectTimer();
    if (this.closeTimer) {
      this.clock.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    // Preserve a terminal 'failed' state set before cleanup began.
    if (this.state !== 'failed') this.setState('closed');
    try {
      this.ws?.close();
    } catch {
      // ignore teardown errors
    }
    this.ws = null;
    this.opts.handlers.onClosed(this.opts.sessionId, reason);
    const resolve = this.closedResolver;
    this.closedResolver = null;
    resolve?.();
  }

  private handleDrop(cause: 'error' | 'close'): void {
    if (this.closeRequested || this.cleanedUp) {
      this.finishClose(`local_${cause}`);
      return;
    }
    const maxAttempts = this.opts.maxReconnectAttempts ?? 5;
    if (this.reconnectAttempts >= maxAttempts) {
      this.setState('failed');
      this.opts.handlers.onError(
        this.opts.sessionId,
        new Error(`sideband reconnect attempts exhausted (${maxAttempts})`),
      );
      this.finishClose('reconnect_exhausted');
      return;    }
    this.reconnectAttempts += 1;
    const baseMs = this.opts.baseBackoffMs ?? 1_000;
    const backoffMs = Math.min(baseMs * 2 ** (this.reconnectAttempts - 1), 30_000);
    const jitterMs = Math.floor(Math.random() * 250);
    this.setState('reconnecting');
    this.opts.handlers.onInfo?.(
      this.opts.sessionId,
      `sideband dropped (${cause}); reconnect attempt ${this.reconnectAttempts}/${maxAttempts} in ${backoffMs}ms`,
    );
    this.ws = null;
    this.reconnectTimer = this.clock.setTimeout(() => {
      this.reconnectTimer = null;
      this.attach();
    }, backoffMs + jitterMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      this.clock.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(next: SidebandState): void {
    this.state = next;
  }

  private handleMessage(data: unknown): void {
    let event: { type?: string; delta?: string; reason?: string } | null = null;
    try {
      const text = typeof data === 'string' ? data : data?.toString();
      event = JSON.parse(text as string);
    } catch {
      return; // ignore malformed frames
    }
    if (!event || typeof event.type !== 'string') return;
    const { sessionId } = this.opts;
    switch (event.type) {
      case 'session.started':
        this.reconnectAttempts = 0;
        this.opts.handlers.onReady(sessionId);
        break;
      case TRANSCRIPT_USER:
        this.opts.handlers.onTranscriptDelta(sessionId, 'user', event.delta ?? '');
        break;
      case TRANSCRIPT_ASSISTANT:
        this.opts.handlers.onTranscriptDelta(sessionId, 'assistant', event.delta ?? '');
        break;
      case 'session.closed':
        this.opts.handlers.onInfo?.(sessionId, `session.closed (reason=${event.reason ?? 'unknown'})`);
        this.finishClose(event.reason ?? 'remote_closed');
        break;
      case 'error':
        this.opts.handlers.onError(sessionId, new Error(`sideband error event: ${JSON.stringify(event)}`));
        break;
      default:
        // session.updated, session.usage.updated, delegation events, etc. —
        // observed in PR 1, acted on in later PRs.
        this.opts.handlers.onInfo?.(sessionId, `sideband event: ${event.type}`);
        break;
    }
  }
}
