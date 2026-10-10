/**
 * Shared pg-mem fixtures for Layer D tests.
 *
 * pg-mem emulates Postgres in-process, so the whole suite stays hermetic:
 * no docker, no service containers, no network. The SQL under test is real
 * Postgres dialect (verified against the migration files), and the store
 * talks to it through the genuine `pg` Pool interface.
 */
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { runMigrations } from '../migrate';
import { PersistentHarnessStore } from '../pgStore';
import { DEFAULT_CURRICULUM } from '../../curriculum';

export const TEST_NOW = 1_750_000_000_000;

/** Raw pg-mem pool WITHOUT migrations (for migration-runner tests). */
export function rawPool(): Pool {
  const db = newDb();
  const { Pool: MemPool } = db.adapters.createPg();
  return new MemPool() as unknown as Pool;
}

/** pg-mem pool with all migrations applied. */
export async function migratedPool(): Promise<Pool> {
  const pool = rawPool();
  await runMigrations(pool);
  return pool;
}

export async function closePool(pool: Pool): Promise<void> {
  await pool.end().catch(() => undefined);
}

/** Persistent store pointed at a migrated pg-mem pool. Flushes manually. */
export function testStore(pool: Pool): PersistentHarnessStore {
  return new PersistentHarnessStore(pool, {
    curriculum: DEFAULT_CURRICULUM,
    flushIntervalMs: 3_600_000, // tests flush explicitly for determinism
    now: () => TEST_NOW,
  });
}
