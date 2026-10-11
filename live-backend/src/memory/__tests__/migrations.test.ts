/**
 * Migration runner integrity: ordered application, ledger recording,
 * idempotent re-runs, and rollback on failure.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { runMigrations } from '../migrate';
import { closePool, rawPool } from './helpers';

const EXPECTED_TABLES = [
  'learners',
  'sessions',
  'utterances',
  'evidence',
  'concept_states',
  'learner_concepts',
  'misconceptions',
  'interventions',
  'retention_snapshots',
  'schema_migrations', // created by the runner itself, not the migration file
].sort();

describe('runMigrations', () => {
  test('applies 0001_initial_schema on a fresh database and records it', async () => {
    const pool = rawPool();
    try {
      const ran = await runMigrations(pool);
      expect(ran).toEqual(['0001_initial_schema', '0002_lesson_progress']);

      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      expect(tables.rows.map((r) => r.table_name).sort()).toEqual(EXPECTED_TABLES);

      const ledger = await pool.query('SELECT version FROM schema_migrations');
      expect(ledger.rows.map((r) => r.version)).toEqual(['0001_initial_schema', '0002_lesson_progress']);
    } finally {
      await closePool(pool);
    }
  });

  test('re-running is a no-op (idempotent)', async () => {
    const pool = rawPool();
    try {
      expect(await runMigrations(pool)).toEqual(['0001_initial_schema', '0002_lesson_progress']);
      expect(await runMigrations(pool)).toEqual([]);
      const count = await pool.query('SELECT count(*)::int AS n FROM schema_migrations');
      expect(count.rows[0].n).toBe(2);
    } finally {
      await closePool(pool);
    }
  });

  test('a failing migration rolls back and is retried on the next run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
    writeFileSync(join(dir, '0001_ok.sql'), 'CREATE TABLE t_ok (id TEXT PRIMARY KEY);');
    writeFileSync(join(dir, '0002_bad.sql'), 'CREATE TABLE t_bad (;');

    const pool = rawPool();
    try {
      await expect(runMigrations(pool, dir)).rejects.toThrow(/0002_bad/);
      // 0001 committed, 0002 not recorded...
      const ledger = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
      expect(ledger.rows.map((r) => r.version)).toEqual(['0001_ok']);
      // ...and the half-applied 0002 left nothing behind.
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 't_bad'`,
      );
      expect(tables.rows).toHaveLength(0);

      // Fix the migration; the next run picks up exactly where it stopped.
      writeFileSync(join(dir, '0002_bad.sql'), 'CREATE TABLE t_bad (id TEXT PRIMARY KEY);');
      expect(await runMigrations(pool, dir)).toEqual(['0002_bad']);
    } finally {
      await closePool(pool);
    }
  });
});
