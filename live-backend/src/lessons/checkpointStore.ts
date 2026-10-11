import type { Pool } from 'pg';
import { getTeachingSpec } from './teachingSpec';
import {
  freshCheckpoint,
  validateCheckpoint,
  type TeachingCheckpoint,
} from './supervisedConductor';

export class TeachingConflictError extends Error {}
export interface SavedCheckpoint {
  revision: number;
  checkpoint: TeachingCheckpoint;
}
interface Row extends SavedCheckpoint {
  owner: string | null;
  leaseUntil: number;
}
/** One process or one browser owns a learner lesson; CAS also rejects expired owners. */
export class CheckpointStore {
  private readonly memory = new Map<string, Row>();
  constructor(private readonly pool?: Pool) {}
  private key(learner: string, number: number): string {
    return `${learner}:${number}`;
  }
  async load(learner: string, number: number): Promise<SavedCheckpoint | null> {
    const spec = getTeachingSpec(number);
    if (this.pool) {
      const r = await this.pool.query(
        'SELECT revision, checkpoint, lesson_version FROM teaching_checkpoints WHERE learner_id=$1 AND lesson_number=$2',
        [learner, number],
      );
      if (!r.rows[0] || r.rows[0].lesson_version !== spec.version) return null;
      return {
        revision: r.rows[0].revision,
        checkpoint: validateCheckpoint(spec, r.rows[0].checkpoint),
      };
    }
    const row = this.memory.get(this.key(learner, number));
    return row && row.checkpoint.lessonVersion === spec.version
      ? {
          revision: row.revision,
          checkpoint: structuredClone(validateCheckpoint(spec, row.checkpoint)),
        }
      : null;
  }
  async loadAll(learner: string): Promise<Map<number, TeachingCheckpoint>> {
    const result = new Map<number, TeachingCheckpoint>();
    if (this.pool) {
      const rows = await this.pool.query(
        'SELECT lesson_number,lesson_version,checkpoint FROM teaching_checkpoints WHERE learner_id=$1',
        [learner],
      );
      for (const row of rows.rows) {
        const spec = getTeachingSpec(row.lesson_number);
        if (row.lesson_version === spec.version)
          result.set(
            row.lesson_number,
            validateCheckpoint(spec, row.checkpoint),
          );
      }
    } else {
      for (const [key, row] of this.memory)
        if (key.startsWith(`${learner}:`)) {
          const spec = getTeachingSpec(row.checkpoint.lessonNumber);
          if (row.checkpoint.lessonVersion === spec.version)
            result.set(
              spec.number,
              structuredClone(validateCheckpoint(spec, row.checkpoint)),
            );
        }
    }
    return result;
  }
  async claim(
    learner: string,
    number: number,
    sessionId: string,
  ): Promise<SavedCheckpoint> {
    const spec = getTeachingSpec(number),
      fresh = freshCheckpoint(spec),
      leaseUntil = new Date(Date.now() + 45000);
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO learners (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [learner],
      );
      const result = await this.pool.query(
        `INSERT INTO teaching_checkpoints
        (learner_id,lesson_number,lesson_version,checkpoint,owner_session_id,lease_until)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (learner_id,lesson_number) DO UPDATE SET
        owner_session_id=EXCLUDED.owner_session_id, lease_until=EXCLUDED.lease_until
        WHERE teaching_checkpoints.owner_session_id IS NULL OR teaching_checkpoints.lease_until < now()
          OR teaching_checkpoints.owner_session_id=EXCLUDED.owner_session_id
        RETURNING revision,checkpoint,lesson_version,owner_session_id`,
        [
          learner,
          number,
          spec.version,
          JSON.stringify(fresh),
          sessionId,
          leaseUntil,
        ],
      );
      if (!result.rows[0] || result.rows[0].owner_session_id !== sessionId)
        throw new TeachingConflictError(
          'lesson is already active in another session',
        );
      const row = result.rows[0];
      if (row.lesson_version !== spec.version) {
        // Content upgrades replay from zero; old completion is never assumed equivalent.
        const reset = await this.pool.query(
          `UPDATE teaching_checkpoints SET lesson_version=$1, checkpoint=$2, revision=revision+1
          WHERE learner_id=$3 AND lesson_number=$4 AND owner_session_id=$5 RETURNING revision`,
          [spec.version, JSON.stringify(fresh), learner, number, sessionId],
        );
        return { revision: reset.rows[0].revision, checkpoint: fresh };
      }
      return {
        revision: row.revision,
        checkpoint: validateCheckpoint(spec, row.checkpoint),
      };
    }
    const key = this.key(learner, number),
      old = this.memory.get(key);
    if (old?.owner && old.owner !== sessionId && old.leaseUntil > Date.now())
      throw new TeachingConflictError(
        'lesson is already active in another session',
      );
    const row =
      old && old.checkpoint.lessonVersion === spec.version
        ? old
        : { revision: 0, checkpoint: fresh, owner: null, leaseUntil: 0 };
    row.owner = sessionId;
    row.leaseUntil = leaseUntil.getTime();
    this.memory.set(key, row);
    return {
      revision: row.revision,
      checkpoint: structuredClone(row.checkpoint),
    };
  }
  async save(
    learner: string,
    sessionId: string,
    expectedRevision: number,
    checkpoint: TeachingCheckpoint,
  ): Promise<number> {
    validateCheckpoint(getTeachingSpec(checkpoint.lessonNumber), checkpoint);
    if (this.pool) {
      const r = await this.pool.query(
        `UPDATE teaching_checkpoints SET checkpoint=$1,revision=revision+1,updated_at=now()
        WHERE learner_id=$2 AND lesson_number=$3 AND revision=$4 AND owner_session_id=$5
        AND lease_until>now() AND lesson_version=$6 RETURNING revision`,
        [
          JSON.stringify(checkpoint),
          learner,
          checkpoint.lessonNumber,
          expectedRevision,
          sessionId,
          checkpoint.lessonVersion,
        ],
      );
      if (!r.rows[0])
        throw new TeachingConflictError(
          'stale checkpoint or lost lesson ownership',
        );
      return r.rows[0].revision;
    }
    const row = this.memory.get(this.key(learner, checkpoint.lessonNumber));
    if (
      !row ||
      row.owner !== sessionId ||
      row.revision !== expectedRevision ||
      row.leaseUntil <= Date.now()
    )
      throw new TeachingConflictError(
        'stale checkpoint or lost lesson ownership',
      );
    row.checkpoint = structuredClone(checkpoint);
    return ++row.revision;
  }
  async renew(
    learner: string,
    number: number,
    sessionId: string,
  ): Promise<void> {
    if (this.pool) {
      const r = await this.pool.query(
        `UPDATE teaching_checkpoints SET lease_until=$1 WHERE learner_id=$2
        AND lesson_number=$3 AND owner_session_id=$4 AND lease_until>now() RETURNING revision`,
        [new Date(Date.now() + 45000), learner, number, sessionId],
      );
      if (!r.rows[0]) throw new TeachingConflictError('lesson lease lost');
    } else {
      const row = this.memory.get(this.key(learner, number));
      if (!row || row.owner !== sessionId || row.leaseUntil <= Date.now())
        throw new TeachingConflictError('lesson lease lost');
      row.leaseUntil = Date.now() + 45000;
    }
  }
  async release(
    learner: string,
    number: number,
    sessionId: string,
  ): Promise<void> {
    if (this.pool)
      await this.pool.query(
        `UPDATE teaching_checkpoints SET owner_session_id=NULL,lease_until=NULL
      WHERE learner_id=$1 AND lesson_number=$2 AND owner_session_id=$3`,
        [learner, number, sessionId],
      );
    else {
      const row = this.memory.get(this.key(learner, number));
      if (row?.owner === sessionId) row.owner = null;
    }
  }
}
