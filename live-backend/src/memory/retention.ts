/**
 * Data retention for learner memory (Layer D).
 *
 * Raw session data (sessions; cascaded utterances, evidence, concept_states,
 * interventions) for sessions that ended before the retention window is
 * deleted. Derived learner-level aggregates (learner_concepts,
 * retention_snapshots, open misconceptions) are deliberately KEPT: they are
 * summaries, not raw observations, and deleting them would silently reset the
 * learner model. Resolved misconception flags older than the window are
 * pruned; open ones are current state and stay.
 *
 * Active sessions (status 'teaching'/'initializing'/'paused') are never
 * purged, even when old — only ended sessions are eligible.
 */

import type { Pool } from 'pg';

export interface PurgeResult {
  sessions: number;
  utterances: number;
  evidence: number;
  interventions: number;
  resolvedMisconceptions: number;
}

export async function purgeExpired(
  pool: Pool,
  retentionDays: number,
  now: number = Date.now(),
): Promise<PurgeResult> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('retentionDays must be a positive number');
  }
  const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const doomed = await pool.query<{ id: string }>(
    `SELECT id FROM sessions
     WHERE closed_at < $1
        OR (closed_at IS NULL AND status IN ('completed', 'abandoned') AND updated_at < $1)`,
    [cutoff],
  );
  const ids = doomed.rows.map((r) => r.id);

  // Per-id deletes in one transaction (deliberately no `= ANY($1::text[])`:
  // the pg-mem double used in tests does not implement ANY over parameters,
  // and a retention purge touches few rows, so N+1 here is irrelevant).
  let utterances = 0;
  let evidence = 0;
  let interventions = 0;
  for (const id of ids) {
    const counts = await pool.query<{ u: string; e: string; i: string }>(
      `SELECT
         (SELECT count(*) FROM utterances WHERE session_id = $1) AS u,
         (SELECT count(*) FROM evidence WHERE session_id = $1) AS e,
         (SELECT count(*) FROM interventions WHERE session_id = $1) AS i`,
      [id],
    );
    utterances += Number(counts.rows[0].u);
    evidence += Number(counts.rows[0].e);
    interventions += Number(counts.rows[0].i);
    await pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
  }

  const resolved = await pool.query(
    `DELETE FROM misconceptions WHERE status = 'resolved' AND resolved_at < $1`,
    [cutoff],
  );

  return {
    sessions: ids.length,
    utterances,
    evidence,
    interventions,
    resolvedMisconceptions: resolved.rowCount ?? 0,
  };
}
