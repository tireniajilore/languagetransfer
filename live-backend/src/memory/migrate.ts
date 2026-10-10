/**
 * Numbered SQL migration runner (Layer D).
 *
 * Migrations live in `live-backend/migrations/` as `NNNN_description.sql` and
 * are applied in filename order, each inside its own transaction. Applied
 * versions are recorded in `schema_migrations`, so re-running is a no-op.
 *
 * The runner deliberately avoids `CREATE TABLE IF NOT EXISTS` inside
 * migration files: the version table is the single source of truth for
 * what has been applied.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

/** Resolves to `live-backend/migrations` both under tsx (src/) and node (dist/). */
export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function ensureVersionTable(pool: Pool): Promise<void> {
  const existing = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`,
  );
  if ((existing.rowCount ?? 0) === 0) {
    await pool.query(
      `CREATE TABLE schema_migrations (
         version TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
  }
}

/**
 * Apply all pending migrations. Returns the versions applied by this call,
 * in order. Throws on the first failing migration (leaving it unrecorded so
 * a later run retries it).
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  await ensureVersionTable(pool);
  const appliedRows = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.rows.map((r: { version: string }) => r.version));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    const version = file.slice(0, -'.sql'.length);
    if (applied.has(version)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      ran.push(version);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(
        `migration ${version} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      client.release();
    }
  }
  return ran;
}
