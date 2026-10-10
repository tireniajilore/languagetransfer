/** Shared fakes for sideband tests. */
import { Clock, SidebandEventHandlers, WebSocketLike } from '../sideband';

export class FakeWs implements WebSocketLike {
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();
  sent: string[] = [];
  closeCalls = 0;
  lastUrl = '';
  lastHeaders: Record<string, string> = {};

  on(event: 'open' | 'message' | 'close' | 'error', cb: (...args: never[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
  }

  emit(event: 'open' | 'message' | 'close' | 'error', ...args: never[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args);
  }

  emitJson(event: 'message', payload: unknown): void {
    this.emit(event, JSON.stringify(payload) as never);
  }
}

export class ManualClock implements Clock {
  private timers = new Map<unknown, () => void>();
  private nextId = 1;

  setTimeout(cb: () => void, _ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, cb);
    return id;
  }

  clearTimeout(id: unknown): void {
    this.timers.delete(id);
  }

  pendingCount(): number {
    return this.timers.size;
  }

  runAll(): void {
    const pending = [...this.timers.values()];
    this.timers.clear();
    for (const cb of pending) cb();
  }
}

export function makeHandlers(): SidebandEventHandlers & {
  ready: string[];
  deltas: Array<{ speaker: string; delta: string }>;
  closed: Array<{ id: string; reason?: string }>;
  errors: unknown[];
  infos: string[];
} {
  const h = {
    ready: [] as string[],
    deltas: [] as Array<{ speaker: string; delta: string }>,
    closed: [] as Array<{ id: string; reason?: string }>,
    errors: [] as unknown[],
    infos: [] as string[],
    onReady(id: string) {
      h.ready.push(id);
    },
    onTranscriptDelta(id: string, speaker: 'user' | 'assistant', delta: string) {
      h.deltas.push({ speaker, delta });
      void id;
    },
    onClosed(id: string, reason?: string) {
      h.closed.push({ id, reason });
    },
    onError(_id: string, err: unknown) {
      h.errors.push(err);
    },
    onInfo(_id: string, msg: string) {
      h.infos.push(msg);
    },
  };
  return h;
}
