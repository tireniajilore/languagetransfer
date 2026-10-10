/**
 * Shared test fixtures for the reasoning layer: a harness store with one
 * initialized session, a router, and helpers to advance teaching state.
 */
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import { Curriculum } from '../../curriculum/types';
import { applyMove, createHarnessState } from '../../harness/stateMachine';
import { HarnessState } from '../../harness/types';
import {
  HarnessStore,
  ToolHandlerContext,
  ToolRouter,
} from '../../harness/tools';

export const CUR: Curriculum = SPANISH_CURRICULUM_V1;

export interface HarnessFixture {
  store: HarnessStore;
  router: ToolRouter;
  ctx: ToolHandlerContext;
  sessionId: string;
}

export function makeHarness(sessionId = 's-test', now = 1_000, objectiveId?: string): HarnessFixture {
  const store = new HarnessStore();
  const ctx: ToolHandlerContext = { store, curriculum: CUR, now: () => now };
  const router = new ToolRouter(ctx, () => undefined);
  store.insert(createHarnessState({ sessionId, curriculum: CUR, now, objectiveId }));
  return { store, router, ctx, sessionId };
}

/** Commit a teaching move directly against the store (bypasses the router). */
export function commitMove(
  fx: HarnessFixture,
  move: unknown,
  now = 1_000,
): HarnessState {
  const before = fx.store.get(fx.sessionId);
  if (!before) throw new Error('no state');
  const next = applyMove(CUR, before, move, { now });
  fx.store.update(fx.sessionId, () => next);
  return next;
}

/** Start teaching the copula concept: the standard entry point for scenarios. */
export function startCopula(fx: HarnessFixture): HarnessState {
  return commitMove(fx, { move: 'introduce_concept', conceptId: 'es-copula' });
}

/** Fake outbound command sink for the DelegationManager / GuardrailMonitor. */
export class FakeSender {
  readonly commands: Record<string, unknown>[] = [];
  sendCommand(command: Record<string, unknown>): void {
    this.commands.push(command);
  }
  ofType(type: string): Record<string, unknown>[] {
    return this.commands.filter((c) => c.type === type);
  }
}
