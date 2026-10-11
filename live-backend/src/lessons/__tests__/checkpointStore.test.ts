import { describe, expect, it } from 'vitest';
import { CheckpointStore } from '../checkpointStore';
import { CourseStore } from '../courseStore';
import { getTeachingSpec } from '../teachingSpec';
import {
  authorizeStep,
  markSent,
  observeSpeech,
  confirmDelivery,
} from '../supervisedConductor';
import { migratedPool, closePool } from '../../memory/__tests__/helpers';

for (const mode of ['memory', 'postgres'] as const)
  describe(`teaching checkpoint CAS (${mode})`, () => {
    it('persists verified delivery and rejects stale/foreign owners across instances', async () => {
      const pool = mode === 'postgres' ? await migratedPool() : undefined;
      try {
        const store = new CheckpointStore(pool),
          spec = getTeachingSpec(2);
        const saved = await store.claim('learner', 2, 'owner');
        await expect(store.claim('learner', 2, 'other')).rejects.toThrow(
          'already active',
        );
        const state = confirmDelivery(
          spec,
          observeSpeech(
            markSent(authorizeStep(spec, saved.checkpoint, 'd')),
            'o',
          ),
          'o',
          true,
          true,
          spec.steps[0].text,
        );
        expect(
          await store.save('learner', 'owner', saved.revision, state),
        ).toBe(saved.revision + 1);
        await expect(
          store.save('learner', 'owner', saved.revision, state),
        ).rejects.toThrow('stale');
        await expect(
          store.save('learner', 'other', saved.revision + 1, state),
        ).rejects.toThrow('stale');
        await store.renew('learner', 2, 'owner');
        await store.release('learner', 2, 'other');
        await expect(store.claim('learner', 2, 'other')).rejects.toThrow(
          'already active',
        );
        await store.release('learner', 2, 'owner');
        const next = await store.claim('learner', 2, 'other');
        expect(next.checkpoint.stepIndex).toBe(1);
        if (pool) {
          const fresh = new CheckpointStore(pool);
          expect(
            (await fresh.load('learner', 2))?.checkpoint.receipts[0]
              .deliveryText,
          ).toContain('Latin');
          await pool.query(
            "INSERT INTO lesson_progress (learner_id,lesson_number,step_index,phase) VALUES ($1,2,999,'completed')",
            ['learner'],
          );
          const rows = await new CourseStore(pool).overview('learner');
          expect(rows.find((l) => l.number === 3)?.status).toBe('locked');
        }
      } finally {
        if (pool) await closePool(pool);
      }
    });
  });
