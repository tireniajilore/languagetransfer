/**
 * Registry of active GPT-Live sessions owned by this backend process.
 *
 * Each entry pairs the session id with its sideband connection. Closing is
 * idempotent: closing an unknown or already-closed session is a no-op that
 * resolves to `false`, so duplicate/retried close requests can never
 * double-advance anything (a property the harness will rely on in PR 2).
 */
import { SidebandConnection } from './sideband';
import type { DelegationManager } from './reasoning/delegation';
import type { GuardrailMonitor } from './reasoning/guardrails';

export interface SessionHandle {
  sideband: SidebandConnection;
  createdAt: number;
  /** Layer C collaborators (PR 3); present when delegation is enabled. */
  delegation?: DelegationManager;
  guardrails?: GuardrailMonitor;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionHandle>();

  register(sessionId: string, handle: SessionHandle): void {
    this.sessions.set(sessionId, handle);
  }

  get(sessionId: string): SessionHandle | undefined {
    return this.sessions.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  /**
   * Graceful close of one session. Returns true when a live entry was
   * closed, false when the id was unknown or already closed (idempotent).
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const handle = this.sessions.get(sessionId);
    if (!handle) return false;
    this.sessions.delete(sessionId);
    await handle.sideband.close();
    return true;
  }

  /** Hard teardown of every session (process shutdown). */
  destroyAll(): void {
    for (const [id, handle] of this.sessions) {
      this.sessions.delete(id);
      handle.sideband.destroy();
    }
  }
}
