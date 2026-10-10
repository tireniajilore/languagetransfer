/**
 * `npm run migrate` — apply pending migrations to DATABASE_URL.
 * Used for staging/production deploys and local development.
 */
import { Pool } from 'pg';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const ran = await runMigrations(pool);
    console.log(ran.length > 0 ? `applied migrations: ${ran.join(', ')}` : 'no pending migrations');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
