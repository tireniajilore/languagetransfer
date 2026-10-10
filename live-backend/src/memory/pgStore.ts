/**
 * Postgres-backed harness store (Layer D, PR 4).
 *
 * PersistentHarnessStore IS-A HarnessStore: every read stays synchronous and
 * in-memory, so the conversational hot path never waits on the database
 * (ADR-001 D6: async persistence off the critical path). Mutations apply to
 * memory first, then persist through a write-behind queue:
 *
 *  - `insert`/`update`/`delete` enqueue an idempotent per-session
 *    reconciliation (`persistSession`): upsert the session row, concept
 *    states, newly appended evidence (high-water mark + ON CONFLICT backstop
 *    on the dedupe key), newly committed moves (→ interventions), and
 *    buffered utterances — all in one transaction.
 *  - The queue flushes on a timer and on explicit `flush()`, which the
 *    server calls on session close and shutdown: no critical progress is
 *    lost when a session ends.
 *  - A crash between memory and disk can only LOSE queued writes, never
 *    duplicate them: every write is an upsert or INSERT ... ON CONFLICT
 *    DO NOTHING, and high-water marks advance only after a commit.
 *
 * Learner-level aggregates (`learner_concepts`, `misconceptions`) are
 * recomputed from evidence on flush for every touched concept, using the
 * state machine's own rule via replay (see mastery.ts) — observations and
 * inferred mastery stay separate, and every estimate carries its derivation.
 */

import { Pool, PoolClient } from 'pg';
import { Curriculum } from '../curriculum/types';
import {
  createHarnessState,
  CreateStateOptions,
  restoreConcepts,
  RestoredConcept,
} from '../harness/stateMachine';
import { ConceptStatus, HarnessState } from '../harness/types';
import { HarnessStore, LearnerSummary } from '../harness/tools';
import { deriveConcept, EvidenceRow } from './mastery';

export interface PersistentStoreOptions {
  curriculum: Curriculum;
  /**
   * Write-behind flush interval. Production default 5s; tests set this very
   * high and flush manually for determinism.
   */
  flushIntervalMs?: number;
  now?: () => number;
}

interface UtteranceRow {
  sessionId: string;
  speaker: 'user' | 'assistant';
  text: string;
  turnId: number;
  seq: number;
}

/**
 * Mirrors the harness evidenceKey() (turnId:kind:conceptId:misconceptionId:seq),
 * namespaced by session for the UNIQUE dedupe_key column.
 */
export function evidenceDedupeKey(
  sessionId: string,
  e: { turnId: number; kind: string; conceptId?: string; misconceptionId?: string; seq?: number },
): string {
  return `${sessionId}:${e.turnId}:${e.kind}:${e.conceptId ?? ''}:${e.misconceptionId ?? ''}:${e.seq ?? ''}`;
}

const MAX_QUEUE = 10_000;
const MAX_ATTEMPTS = 5;

export class PersistentHarnessStore extends HarnessStore {
  private readonly pool: Pool;
  private readonly curriculum: Curriculum;
  private readonly flushIntervalMs: number;
  private readonly now: () => number;

  private queue: Array<{ run: () => Promise<void>; attempts: number }> = [];
  private flushing = false;
  private flushTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  /** sessionId -> generation; a newer sync supersedes older queued ones. */
  private readonly syncGenerations = new Map<string, number>();
  private readonly evidenceHighWater = new Map<string, number>();
  private readonly movesHighWater = new Map<string, number>();
  private readonly snapshotsWritten = new Set<string>();
  private readonly pendingUtterances = new Map<string, UtteranceRow[]>();
  private readonly learnerCache = new Map<string, LearnerSummary>();

  constructor(pool: Pool, opts: PersistentStoreOptions) {
    super();
    this.pool = pool;
    this.curriculum = opts.curriculum;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5000;
    this.now = opts.now ?? Date.now;
  }

  // ------------------------------------------------------------------
  // HarnessStore overrides
  // ------------------------------------------------------------------

  override insert(state: HarnessState): void {
    super.insert(state);
    this.scheduleSync(state.sessionId);
  }

  override update(
    sessionId: string,
    fn: (s: HarnessState) => HarnessState,
  ): HarnessState {
    const next = super.update(sessionId, fn);
    this.scheduleSync(sessionId);
    return next;
  }

  override delete(sessionId: string): void {
    super.delete(sessionId);
    this.enqueue(async () => {
      await this.pool.query(
        `UPDATE sessions
         SET status = 'abandoned', closed_at = COALESCE(closed_at, now()), updated_at = now()
         WHERE id = $1`,
        [sessionId],
      );
    });
  }

  override async prepareSession(opts: CreateStateOptions): Promise<HarnessState> {
    const learnerId = opts.learnerId;
    if (learnerId) {
      await this.pool.query(
        `INSERT INTO learners (id, last_seen_at) VALUES ($1, now())
         ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
        [learnerId],
      );
    }
    let state = createHarnessState(opts);
    if (learnerId) {
      const restored = await this.loadLearnerConcepts(learnerId);
      if (Object.keys(restored).length > 0) {
        state = restoreConcepts(this.curriculum, state, restored);
      }
      await this.refreshLearnerCache(learnerId);
    }
    super.insert(state);
    this.scheduleSync(state.sessionId);
    return state;
  }

  override async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      let backoffMs = 100;
      while (this.queue.length > 0 && !this.stopped) {
        const op = this.queue.shift()!;
        try {
          await op.run();
          backoffMs = 100;
        } catch (err) {
          op.attempts += 1;
          console.error(
            `[memory] persist failed (attempt ${op.attempts}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          if (op.attempts < MAX_ATTEMPTS) {
            this.queue.unshift(op);
            await new Promise((r) => setTimeout(r, backoffMs));
            backoffMs = Math.min(backoffMs * 2, 5000);
          } else {
            // Idempotent reconciliation: the next scheduled sync re-covers
            // whatever this op would have written.
            console.error('[memory] persist op dropped after retries; next sync re-covers it');
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  override recordUtterance(u: {
    sessionId: string;
    speaker: 'user' | 'assistant';
    text: string;
    turnId: number;
    seq: number;
  }): void {
    const list = this.pendingUtterances.get(u.sessionId) ?? [];
    list.push({ ...u });
    this.pendingUtterances.set(u.sessionId, list);
    this.scheduleSync(u.sessionId);
  }

  override getLearnerSummary(learnerId: string): LearnerSummary | null {
    return this.learnerCache.get(learnerId) ?? null;
  }

  /** Stop the background flush timer. Call on shutdown and in tests. */
  close(): void {
    this.stopped = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  // ------------------------------------------------------------------
  // Queue plumbing
  // ------------------------------------------------------------------

  private enqueue(run: () => Promise<void>): void {
    if (this.stopped) return;
    if (this.queue.length >= MAX_QUEUE) {
      console.error('[memory] persist queue full; dropping oldest op');
      this.queue.shift();
    }
    this.queue.push({ run, attempts: 0 });
    this.scheduleFlush();
  }

  private scheduleSync(sessionId: string): void {
    const gen = (this.syncGenerations.get(sessionId) ?? 0) + 1;
    this.syncGenerations.set(sessionId, gen);
    this.enqueue(async () => {
      if (this.syncGenerations.get(sessionId) !== gen) return; // superseded
      await this.persistSession(sessionId);
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.stopped) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush().catch((err) =>
        console.error(
          '[memory] background flush failed:',
          err instanceof Error ? err.message : String(err),
        ),
      );
    }, this.flushIntervalMs);
    this.flushTimer.unref();
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------

  /**
   * Reconcile one session's in-memory state to Postgres, idempotently.
   * High-water marks advance only after a successful commit, so a failed
   * flush retries exactly the un-persisted tail.
   */
  private async persistSession(sessionId: string): Promise<void> {
    const state = this.get(sessionId);
    if (!state) {
      await this.pool.query(
        `UPDATE sessions
         SET status = 'abandoned', closed_at = COALESCE(closed_at, now()), updated_at = now()
         WHERE id = $1`,
        [sessionId],
      );
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (state.learnerId) {
        await client.query(
          `INSERT INTO learners (id, last_seen_at) VALUES ($1, now())
           ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
          [state.learnerId],
        );
      }
      await client.query(
        `INSERT INTO sessions (id, learner_id, curriculum_version, subject_id, objective_id, status, turn, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (id) DO UPDATE SET
           learner_id = excluded.learner_id,
           objective_id = excluded.objective_id,
           status = excluded.status,
           turn = excluded.turn,
           updated_at = now()`,
        [
          state.sessionId,
          state.learnerId ?? null,
          state.curriculumVersion,
          state.subjectId,
          state.currentObjectiveId,
          state.status,
          state.turn,
        ],
      );
      for (const [conceptId, cs] of Object.entries(state.concepts)) {
        await client.query(
          `INSERT INTO concept_states
             (session_id, concept_id, status, correct_count, incorrect_count, transfer_pass_count, hints_used, open_misconceptions, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (session_id, concept_id) DO UPDATE SET
             status = excluded.status,
             correct_count = excluded.correct_count,
             incorrect_count = excluded.incorrect_count,
             transfer_pass_count = excluded.transfer_pass_count,
             hints_used = excluded.hints_used,
             open_misconceptions = excluded.open_misconceptions,
             updated_at = now()`,
          [
            state.sessionId,
            conceptId,
            cs.status,
            cs.correctCount,
            cs.incorrectCount,
            cs.transferPassCount,
            cs.hintsUsed,
            cs.openMisconceptions,
          ],
        );
      }
      const hw = this.evidenceHighWater.get(sessionId) ?? 0;
      const freshEvidence = state.evidence.slice(hw);
      for (const ev of freshEvidence) {
        await client.query(
          `INSERT INTO evidence
             (session_id, learner_id, turn_id, seq, concept_id, kind, detail, misconception_id, recorded_at, dedupe_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            state.sessionId,
            state.learnerId ?? null,
            ev.turnId,
            ev.seq ?? null,
            ev.conceptId ?? null,
            ev.kind,
            ev.detail ?? null,
            ev.misconceptionId ?? null,
            new Date(ev.recordedAt).toISOString(),
            evidenceDedupeKey(state.sessionId, ev),
          ],
        );
      }
      const mhw = this.movesHighWater.get(sessionId) ?? 0;
      for (const m of state.moves.slice(mhw)) {
        await client.query(
          `INSERT INTO interventions
             (session_id, learner_id, turn_id, decision_id, move, move_detail, rationale, committed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (session_id, decision_id) DO NOTHING`,
          [
            state.sessionId,
            state.learnerId ?? null,
            m.turn,
            m.decisionId,
            m.move.move,
            JSON.stringify(m.move),
            m.rationale ?? null,
            new Date(m.committedAt).toISOString(),
          ],
        );
      }
      const utterances = this.pendingUtterances.get(sessionId) ?? [];
      for (const u of utterances) {
        await client.query(
          `INSERT INTO utterances (session_id, learner_id, turn_id, seq, speaker, text)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (session_id, seq) DO NOTHING`,
          [state.sessionId, state.learnerId ?? null, u.turnId, u.seq, u.speaker, u.text],
        );
      }
      if (state.learnerId) {
        const touched = new Set<string>();
        for (const ev of freshEvidence) if (ev.conceptId) touched.add(ev.conceptId);
        for (const conceptId of touched) {
          await this.recomputeLearnerConcept(client, state.learnerId, conceptId);
        }
      }
      if (
        state.learnerId &&
        (state.status === 'completed' || state.status === 'abandoned') &&
        !this.snapshotsWritten.has(sessionId)
      ) {
        for (const [conceptId, cs] of Object.entries(state.concepts)) {
          await client.query(
            `INSERT INTO retention_snapshots
               (learner_id, concept_id, status, correct_count, transfer_pass_count, open_misconceptions)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              state.learnerId,
              conceptId,
              cs.status,
              cs.correctCount,
              cs.transferPassCount,
              cs.openMisconceptions,
            ],
          );
        }
        this.snapshotsWritten.add(sessionId);
      }
      await client.query('COMMIT');
      this.evidenceHighWater.set(sessionId, state.evidence.length);
      this.movesHighWater.set(sessionId, state.moves.length);
      this.pendingUtterances.delete(sessionId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    if (state.learnerId) {
      await this.refreshLearnerCache(state.learnerId).catch((err) =>
        console.error(
          '[memory] learner cache refresh failed:',
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }

  /** Recompute one learner-level concept aggregate from all its evidence. */
  private async recomputeLearnerConcept(
    client: PoolClient,
    learnerId: string,
    conceptId: string,
  ): Promise<void> {
    const rows = await client.query(
      `SELECT id, turn_id, seq, concept_id, kind, detail, misconception_id, recorded_at
       FROM evidence
       WHERE learner_id = $1 AND concept_id = $2
       ORDER BY recorded_at, id`,
      [learnerId, conceptId],
    );
    const evidenceRows: EvidenceRow[] = rows.rows.map((r) => ({
      id: Number(r.id),
      turnId: Number(r.turn_id),
      seq: r.seq == null ? null : Number(r.seq),
      conceptId: r.concept_id,
      kind: String(r.kind),
      detail: r.detail,
      misconceptionId: r.misconception_id,
      recordedAt: new Date(r.recorded_at).getTime(),
    }));
    const derived = deriveConcept(this.curriculum, learnerId, conceptId, evidenceRows);
    await client.query(
      `INSERT INTO learner_concepts
         (learner_id, concept_id, status, correct_count, incorrect_count, transfer_pass_count, open_misconceptions, derivation, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (learner_id, concept_id) DO UPDATE SET
         status = excluded.status,
         correct_count = excluded.correct_count,
         incorrect_count = excluded.incorrect_count,
         transfer_pass_count = excluded.transfer_pass_count,
         open_misconceptions = excluded.open_misconceptions,
         derivation = excluded.derivation,
         updated_at = now()`,
      [
        learnerId,
        conceptId,
        derived.status,
        derived.correctCount,
        derived.incorrectCount,
        derived.transferPassCount,
        derived.openMisconceptions,
        JSON.stringify(derived.derivation),
      ],
    );
    const flagged = new Set<string>();
    for (const r of evidenceRows) {
      if (r.kind === 'misconception_flagged' && r.misconceptionId) flagged.add(r.misconceptionId);
    }
    for (const mid of flagged) {
      const open = derived.openMisconceptions.includes(mid);
      await client.query(
        `INSERT INTO misconceptions (learner_id, concept_id, misconception_id, status, resolved_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'resolved' THEN now() ELSE NULL END)
         ON CONFLICT (learner_id, concept_id, misconception_id) DO UPDATE SET
           status = excluded.status,
           resolved_at = CASE WHEN excluded.status = 'resolved' THEN now() ELSE NULL END`,
        [learnerId, conceptId, mid, open ? 'open' : 'resolved'],
      );
    }
  }

  private async loadLearnerConcepts(
    learnerId: string,
  ): Promise<Record<string, RestoredConcept>> {
    const rows = await this.pool.query(
      `SELECT concept_id, status, correct_count, incorrect_count, transfer_pass_count, open_misconceptions
       FROM learner_concepts WHERE learner_id = $1`,
      [learnerId],
    );
    const out: Record<string, RestoredConcept> = {};
    for (const r of rows.rows) {
      out[String(r.concept_id)] = {
        status: String(r.status) as ConceptStatus,
        correctCount: Number(r.correct_count),
        incorrectCount: Number(r.incorrect_count),
        transferPassCount: Number(r.transfer_pass_count),
        openMisconceptions: (r.open_misconceptions ?? []) as string[],
      };
    }
    return out;
  }

  private async refreshLearnerCache(learnerId: string): Promise<void> {
    const [concepts, misconceptions, sessions] = await Promise.all([
      this.pool.query(
        `SELECT concept_id, status, correct_count, transfer_pass_count, open_misconceptions
         FROM learner_concepts WHERE learner_id = $1`,
        [learnerId],
      ),
      this.pool.query(
        `SELECT concept_id, misconception_id FROM misconceptions
         WHERE learner_id = $1 AND status = 'open'`,
        [learnerId],
      ),
      this.pool.query(
        `SELECT count(*)::int AS n, max(updated_at) AS last FROM sessions WHERE learner_id = $1`,
        [learnerId],
      ),
    ]);
    const mastered = concepts.rows
      .filter((r) => String(r.status) === 'mastered')
      .map((r) => String(r.concept_id));
    this.learnerCache.set(learnerId, {
      learnerId,
      sessionsCount: Number(sessions.rows[0]?.n ?? 0),
      masteredConcepts: mastered,
      openMisconceptions: misconceptions.rows.map((r) => ({
        conceptId: String(r.concept_id),
        misconceptionId: String(r.misconception_id),
      })),
      concepts: concepts.rows.map((r) => ({
        conceptId: String(r.concept_id),
        status: String(r.status),
        correctCount: Number(r.correct_count),
        transferPassCount: Number(r.transfer_pass_count),
        openMisconceptions: (r.open_misconceptions ?? []) as string[],
      })),
      lastActiveAt: sessions.rows[0]?.last ? new Date(sessions.rows[0].last).getTime() : null,
    });
  }
}
