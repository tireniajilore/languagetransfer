import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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
  /** SHA-256 of the per-session browser capability; never store the raw token. */
  accessHash?: Buffer;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionHandle>();

  register(sessionId: string, handle: SessionHandle): string {
    const token = randomBytes(32).toString('base64url');
    const accessHash = createHash('sha256').update(token).digest();
    this.sessions.set(sessionId, { ...handle, accessHash });
    return token;
  }

  authorize(sessionId: string, token: string | undefined): boolean {
    const digest = this.sessions.get(sessionId)?.accessHash;
    if (!token || !digest) return false;
    const candidate = createHash('sha256').update(token).digest();
    return timingSafeEqual(digest, candidate);
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
