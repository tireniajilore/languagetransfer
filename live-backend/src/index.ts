/**
 * Entry point: validate config, run migrations + retention when DATABASE_URL
 * is set, start HTTP, wire shutdown.
 *
 * Without DATABASE_URL the backend runs exactly as before: the in-memory
 * harness store, nothing persisted.
 */
import { Pool } from 'pg';
import { loadConfig } from './config';
import { createApp, createHarnessDeps } from './server';
import { HarnessStore } from './harness/tools';
import { DEFAULT_CURRICULUM } from './curriculum';
import { MIGRATIONS_DIR, PersistentHarnessStore, purgeExpired, runMigrations } from './memory';
import { SessionRegistry } from './sessions';
import { CourseStore } from './lessons/courseStore';

async function main(): Promise<void> {
  const config = loadConfig(); // throws ConfigError on missing OPENAI_API_KEY
  const registry = new SessionRegistry();

  let store: HarnessStore = new HarnessStore();
  let pool: Pool | undefined;
  if (config.databaseUrl) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (err) => console.error('[memory] pool error:', err));
    const applied = await runMigrations(pool, MIGRATIONS_DIR);
    console.log(
      `[memory] postgres learner memory enabled; migrations applied: ${
        applied.length > 0 ? applied.join(', ') : 'none pending'
      }`,
    );
    try {
      const purged = await purgeExpired(pool, config.memoryRetentionDays);
      if (purged.sessions > 0) {
        console.log(
          `[memory] retention purge: ${purged.sessions} sessions, ${purged.evidence} evidence rows`,
        );
      }
    } catch (err) {
      // Retention is housekeeping: never block startup on it.
      console.error(
        '[memory] retention purge failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
    store = new PersistentHarnessStore(pool, {
      curriculum: DEFAULT_CURRICULUM,
      flushIntervalMs: config.memoryFlushIntervalMs,
    });
  }

  const harness = createHarnessDeps(DEFAULT_CURRICULUM, store);
  const app = createApp({ config, registry, harness, courseStore: new CourseStore(pool) });

  const server = app.listen(config.port, () => {
    console.log(`[live-backend] listening on :${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[live-backend] ${signal} received; closing ${registry.size} session(s)`);
    void (async () => {
      try {
        // Flush-on-shutdown: bound the loss window for queued writes.
        await store.flush();
      } catch (err) {
        console.error(
          '[memory] shutdown flush failed:',
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        try {
          await pool?.end();
        } catch {
          // ignore pool close errors during shutdown
        }
        registry.destroyAll();
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5_000).unref();
      }
    })();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[live-backend] startup failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
