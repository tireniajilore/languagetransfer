/**
 * Layer D tests (hermetic, pg-mem):
 *
 *  - store contract shared by the in-memory and persistent implementations;
 *  - write-behind persistence: exactly-once evidence, utterances,
 *    interventions, concept states;
 *  - learner-level mastery derivation (conservative rule, auditable);
 *  - session restoration and cross-session personalization;
 *  - retention purge keeps aggregates, drops raw session data.
 */
import { describe, expect, test, beforeAll, afterAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { DEFAULT_CURRICULUM } from '../../curriculum';
import { createHarnessState, recordEvidence } from '../../harness/stateMachine';
import { EvidenceKind, HarnessState } from '../../harness/types';
import { HarnessStore, ToolError, ToolRouter } from '../../harness/tools';
import { PersistentHarnessStore } from '../pgStore';
import { deriveConcept, progressionForConcept } from '../mastery';
import { purgeExpired } from '../retention';
import { closePool, migratedPool, testStore, TEST_NOW } from './helpers';

const QUIERO = 'es-al-endings'; // in the default objective es-obj-cognates
const QUIERO_INF = 'es-ant-ent-endings'; // prereq: es-al-endings
const MIS_YO = 'm-al-stress'; // registered on es-al-endings

interface EvInput {
  turnId: number;
  conceptId?: string;
  kind: EvidenceKind;
  detail?: string;
  misconceptionId?: string;
  seq?: number;
}

function record(store: HarnessStore, sessionId: string, input: EvInput): void {
  store.update(sessionId, (s) => recordEvidence(DEFAULT_CURRICULUM, s, input, TEST_NOW));
}

/** 2 correct + 1 transfer pass: the conservative bar for these concepts. */
function masterQuiero(store: HarnessStore, sessionId: string, turnBase = 1): void {
  record(store, sessionId, { turnId: turnBase, conceptId: QUIERO, kind: 'correct', seq: 11 });
  record(store, sessionId, { turnId: turnBase, conceptId: QUIERO, kind: 'correct', seq: 12 });
  record(store, sessionId, {
    turnId: turnBase + 1,
    conceptId: QUIERO,
    kind: 'transfer_pass',
    seq: 13,
  });
}

async function mkSession(
  store: HarnessStore,
  sessionId: string,
  learnerId?: string,
): Promise<HarnessState> {
  return store.prepareSession({ sessionId, curriculum: DEFAULT_CURRICULUM, learnerId });
}

// ---------------------------------------------------------------------------
// Contract shared by both store implementations
// ---------------------------------------------------------------------------

function contractSuite(label: string, make: () => HarnessStore): void {
  test(`${label}: insert/get roundtrip`, () => {
    const store = make();
    const state = createHarnessState({ sessionId: 'c1', curriculum: DEFAULT_CURRICULUM });
    store.insert(state);
    expect(store.get('c1')?.sessionId).toBe('c1');
    expect(store.size).toBe(1);
  });

  test(`${label}: duplicate insert throws`, () => {
    const store = make();
    const state = createHarnessState({ sessionId: 'c1', curriculum: DEFAULT_CURRICULUM });
    store.insert(state);
    expect(() => store.insert(state)).toThrow(/already exists/);
  });

  test(`${label}: update applies the transition`, () => {
    const store = make();
    store.insert(createHarnessState({ sessionId: 'c1', curriculum: DEFAULT_CURRICULUM }));
    const next = store.update('c1', (s) => ({ ...s, turn: 7 }));
    expect(next.turn).toBe(7);
    expect(store.get('c1')?.turn).toBe(7);
  });

  test(`${label}: update on unknown session throws unknown_session`, () => {
    const store = make();
    try {
      store.update('nope', (s) => s);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).code).toBe('unknown_session');
    }
  });

  test(`${label}: delete removes the session`, () => {
    const store = make();
    store.insert(createHarnessState({ sessionId: 'c1', curriculum: DEFAULT_CURRICULUM }));
    store.delete('c1');
    expect(store.get('c1')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  test(`${label}: prepareSession creates and registers state`, async () => {
    const store = make();
    const state = await store.prepareSession({
      sessionId: 'c1',
      curriculum: DEFAULT_CURRICULUM,
      learnerId: 'L',
    });
    expect(state.learnerId).toBe('L');
    expect(store.get('c1')?.sessionId).toBe('c1');
  });
}

describe('store contract', () => {
  contractSuite('HarnessStore (in-memory)', () => new HarnessStore());

  describe('PersistentHarnessStore', () => {
    let pool: Pool;
    const stores: PersistentHarnessStore[] = [];
    beforeAll(async () => {
      pool = await migratedPool();
    });
    afterAll(async () => {
      await closePool(pool);
    });
    afterEach(() => {
      for (const s of stores.splice(0)) s.close();
    });
    contractSuite('PersistentHarnessStore', () => {
      const s = testStore(pool);
      stores.push(s);
      return s;
    });
  });
});

// ---------------------------------------------------------------------------
// Write-behind persistence
// ---------------------------------------------------------------------------

describe('PersistentHarnessStore persistence', () => {
  let pool: Pool;
  const stores: PersistentHarnessStore[] = [];
  beforeAll(async () => {
    pool = await migratedPool();
  });
  afterAll(async () => {
    await closePool(pool);
  });
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
  });

  function mkStore(): PersistentHarnessStore {
    const s = testStore(pool);
    stores.push(s);
    return s;
  }

  async function evidenceCount(sessionId: string): Promise<number> {
    const r = await pool.query('SELECT count(*)::int AS n FROM evidence WHERE session_id = $1', [
      sessionId,
    ]);
    return r.rows[0].n as number;
  }

  test('evidence persists exactly once, even across repeated flushes', async () => {
    const store = mkStore();
    await mkSession(store, 's-ev1');
    record(store, 's-ev1', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 1 });
    record(store, 's-ev1', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 2 });
    await store.flush();
    await store.flush();
    expect(await evidenceCount('s-ev1')).toBe(2);
  });

  test('duplicate evidence never double-counts, in memory or on disk', async () => {
    const store = mkStore();
    await mkSession(store, 's-ev2');
    const input: EvInput = { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 9 };
    record(store, 's-ev2', input);
    record(store, 's-ev2', input);
    expect(store.get('s-ev2')!.evidence).toHaveLength(1);
    await store.flush();
    expect(await evidenceCount('s-ev2')).toBe(1);
  });

  test('utterances archive speaker and text', async () => {
    const store = mkStore();
    await mkSession(store, 's-ut');
    store.recordUtterance({ sessionId: 's-ut', speaker: 'user', text: 'quiero comer', turnId: 0, seq: 1 });
    store.recordUtterance({ sessionId: 's-ut', speaker: 'assistant', text: 'muy bien', turnId: 0, seq: 2 });
    await store.flush();
    const rows = await pool.query(
      'SELECT speaker, text FROM utterances WHERE session_id = $1 ORDER BY seq',
      ['s-ut'],
    );
    expect(rows.rows).toEqual([
      { speaker: 'user', text: 'quiero comer' },
      { speaker: 'assistant', text: 'muy bien' },
    ]);
  });

  test('concept states mirror the harness computation', async () => {
    const store = mkStore();
    await mkSession(store, 's-cs');
    record(store, 's-cs', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 1 });
    record(store, 's-cs', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 2 });
    await store.flush();
    const row = await pool.query(
      'SELECT status, correct_count FROM concept_states WHERE session_id = $1 AND concept_id = $2',
      ['s-cs', QUIERO],
    );
    expect(row.rows[0].correct_count).toBe(2);
    expect(row.rows[0].status).toBe(store.get('s-cs')!.concepts[QUIERO].status);
  });

  test('committed moves become interventions', async () => {
    const store = mkStore();
    await mkSession(store, 's-mv');
    const router = new ToolRouter({ store, curriculum: DEFAULT_CURRICULUM, now: () => TEST_NOW });
    const res = router.dispatch({
      sessionId: 's-mv',
      tool: 'commit_teaching_decision',
      input: {
        turnId: 1,
        move: { move: 'introduce_concept', conceptId: QUIERO },
        rationale: 'start here',
      },
    });
    expect(res.ok).toBe(true);
    await store.flush();
    const rows = await pool.query(
      'SELECT move, turn_id, rationale FROM interventions WHERE session_id = $1',
      ['s-mv'],
    );
    expect(rows.rows).toEqual([{ move: 'introduce_concept', turn_id: 1, rationale: 'start here' }]);
  });

  test('a restart loses nothing already flushed', async () => {
    const s1 = mkStore();
    await mkSession(s1, 's-rs', 'LR1');
    record(s1, 's-rs', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 1 });
    await s1.flush();
    s1.close();
    // Fresh store, same database: the row is there.
    expect(await evidenceCount('s-rs')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Learner-level mastery derivation
// ---------------------------------------------------------------------------

describe('learner-level mastery', () => {
  let pool: Pool;
  const stores: PersistentHarnessStore[] = [];
  beforeAll(async () => {
    pool = await migratedPool();
  });
  afterAll(async () => {
    await closePool(pool);
  });
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
  });

  function mkStore(): PersistentHarnessStore {
    const s = testStore(pool);
    stores.push(s);
    return s;
  }

  async function learnerConcept(learnerId: string, conceptId: string) {
    const r = await pool.query(
      'SELECT status, correct_count, transfer_pass_count, open_misconceptions, derivation FROM learner_concepts WHERE learner_id = $1 AND concept_id = $2',
      [learnerId, conceptId],
    );
    return r.rows[0];
  }

  test('mastery derives from evidence with an auditable trail', async () => {
    const store = mkStore();
    await mkSession(store, 's-lc1', 'L1');
    masterQuiero(store, 's-lc1');
    await store.flush();
    const row = await learnerConcept('L1', QUIERO);
    expect(row.status).toBe('mastered');
    expect(row.correct_count).toBe(3); // transfer_pass counts as correct too
    expect(row.transfer_pass_count).toBe(1);
    expect(row.derivation.rule).toBe('conservative-v1');
    expect(row.derivation.minCorrectEvidence).toBe(2);
    expect(row.derivation.requireTransferPass).toBe(true);
    expect(row.derivation.evidenceIds).toHaveLength(3);
  });

  test('a single correct answer is not mastery', async () => {
    const store = mkStore();
    await mkSession(store, 's-lc2', 'L2');
    record(store, 's-lc2', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 1 });
    await store.flush();
    const row = await learnerConcept('L2', QUIERO);
    expect(row.status).not.toBe('mastered');
  });

  test('misconceptions open and resolve in the durable table', async () => {
    const store = mkStore();
    await mkSession(store, 's-mc', 'L3');
    record(store, 's-mc', {
      turnId: 1,
      conceptId: QUIERO,
      kind: 'misconception_flagged',
      misconceptionId: MIS_YO,
      seq: 1,
    });
    await store.flush();
    let row = await pool.query(
      `SELECT status FROM misconceptions WHERE learner_id = $1 AND misconception_id = $2`,
      ['L3', MIS_YO],
    );
    expect(row.rows[0].status).toBe('open');

    // A correct answer resolves the flag (state-machine semantics).
    record(store, 's-mc', { turnId: 2, conceptId: QUIERO, kind: 'correct', seq: 2 });
    await store.flush();
    row = await pool.query(
      `SELECT status FROM misconceptions WHERE learner_id = $1 AND misconception_id = $2`,
      ['L3', MIS_YO],
    );
    expect(row.rows[0].status).toBe('resolved');
  });

  test('get_learner_history surfaces the cross-session summary', async () => {
    const store = mkStore();
    await mkSession(store, 's-h1', 'LH');
    masterQuiero(store, 's-h1');
    await store.flush();
    const router = new ToolRouter({ store, curriculum: DEFAULT_CURRICULUM, now: () => TEST_NOW });
    const res = router.dispatch({ sessionId: 's-h1', tool: 'get_learner_history', input: {} });
    expect(res.ok).toBe(true);
    const body = res.result as {
      crossSession: {
        masteredConcepts: string[];
        sessionsCount: number;
        learnerId: string;
      } | null;
    };
    expect(body.crossSession?.learnerId).toBe('LH');
    expect(body.crossSession?.masteredConcepts).toContain(QUIERO);
    expect(body.crossSession?.sessionsCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Session restoration and cross-session personalization
// ---------------------------------------------------------------------------

describe('session restoration', () => {
  let pool: Pool;
  const stores: PersistentHarnessStore[] = [];
  beforeAll(async () => {
    pool = await migratedPool();
  });
  afterAll(async () => {
    await closePool(pool);
  });
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
  });

  function mkStore(): PersistentHarnessStore {
    const s = testStore(pool);
    stores.push(s);
    return s;
  }

  test('a returning learner resumes mastered concepts with unlocked prereqs', async () => {
    const s1 = mkStore();
    await mkSession(s1, 's-r1', 'LR');
    masterQuiero(s1, 's-r1');
    await s1.flush();
    s1.close();

    const s2 = mkStore();
    const state = await s2.prepareSession({
      sessionId: 's-r2',
      curriculum: DEFAULT_CURRICULUM,
      learnerId: 'LR',
    });
    expect(state.concepts[QUIERO].status).toBe('mastered');
    // es-quiero-infinitive requires es-quiero-want: restored mastery unlocks it.
    expect(state.concepts[QUIERO_INF].status).toBe('available');
  });

  test('open misconceptions carry into the next session', async () => {
    const s1 = mkStore();
    await mkSession(s1, 's-r3', 'LRM');
    record(s1, 's-r3', {
      turnId: 1,
      conceptId: QUIERO,
      kind: 'misconception_flagged',
      misconceptionId: MIS_YO,
      seq: 1,
    });
    await s1.flush();
    s1.close();

    const s2 = mkStore();
    const state = await s2.prepareSession({
      sessionId: 's-r4',
      curriculum: DEFAULT_CURRICULUM,
      learnerId: 'LRM',
    });
    expect(state.concepts[QUIERO].openMisconceptions).toContain(MIS_YO);
    expect(state.concepts[QUIERO].status).toBe('in_progress');
  });

  test('an unknown learner starts fresh', async () => {
    const store = mkStore();
    const state = await mkSession(store, 's-r5', 'BRAND-NEW');
    const mastered = Object.values(state.concepts).filter((c) => c.status === 'mastered');
    expect(mastered).toHaveLength(0);
    expect(state.concepts[QUIERO_INF].status).toBe('locked');
  });

  test('prior mastery changes the teaching plan', async () => {
    const s1 = mkStore();
    await mkSession(s1, 's-i1', 'LX');
    masterQuiero(s1, 's-i1');
    await s1.flush();
    s1.close();

    const s2 = mkStore();
    await mkSession(s2, 's-i2', 'LX');
    const router = new ToolRouter({ store: s2, curriculum: DEFAULT_CURRICULUM, now: () => TEST_NOW });
    const res = router.dispatch({
      sessionId: 's-i2',
      tool: 'get_teaching_options',
      input: { conceptId: QUIERO_INF },
    });
    expect(res.ok).toBe(true);
    const moves = (res.result as { options: Array<{ move: { move: string } }> }).options.map(
      (o) => o.move.move,
    );
    expect(moves).toContain('introduce_concept');

    // A fresh learner's prereq is still locked: no introduction offered.
    const s3 = mkStore();
    await mkSession(s3, 's-i3', 'LY');
    const router3 = new ToolRouter({
      store: s3,
      curriculum: DEFAULT_CURRICULUM,
      now: () => TEST_NOW,
    });
    const res3 = router3.dispatch({
      sessionId: 's-i3',
      tool: 'get_teaching_options',
      input: { conceptId: QUIERO_INF },
    });
    const moves3 = (res3.result as { options: Array<{ move: { move: string } }> }).options.map(
      (o) => o.move.move,
    );
    expect(moves3).not.toContain('introduce_concept');
  });
});

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

describe('purgeExpired', () => {
  let pool: Pool;
  const stores: PersistentHarnessStore[] = [];
  beforeAll(async () => {
    pool = await migratedPool();
  });
  afterAll(async () => {
    await closePool(pool);
  });
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
  });

  test('drops old ended sessions but keeps aggregates and live sessions', async () => {
    const store = testStore(pool);
    stores.push(store);
    await mkSession(store, 's-old', 'LP');
    record(store, 's-old', { turnId: 1, conceptId: QUIERO, kind: 'correct', seq: 1 });
    await store.flush();
    const oldTs = new Date(TEST_NOW - 200 * 86400_1000).toISOString();
    await pool.query(
      `UPDATE sessions SET status = 'abandoned', closed_at = $1, updated_at = $1 WHERE id = 's-old'`,
      [oldTs],
    );
    await mkSession(store, 's-new', 'LP');
    await store.flush();

    const res = await purgeExpired(pool, 30, TEST_NOW);
    expect(res.sessions).toBe(1);

    const gone = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE id = $1', ['s-old']);
    expect(gone.rows[0].n).toBe(0);
    const evGone = await pool.query(
      'SELECT count(*)::int AS n FROM evidence WHERE session_id = $1',
      ['s-old'],
    );
    expect(evGone.rows[0].n).toBe(0);
    // The derived aggregate survives the purge.
    const agg = await pool.query(
      'SELECT count(*)::int AS n FROM learner_concepts WHERE learner_id = $1',
      ['LP'],
    );
    expect(agg.rows[0].n).toBeGreaterThan(0);
    // The live session is untouched.
    const live = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE id = $1', ['s-new']);
    expect(live.rows[0].n).toBe(1);
  });

  test('rejects non-positive retention windows', async () => {
    await expect(purgeExpired(pool, 0)).rejects.toThrow(/positive/);
  });
});

// ---------------------------------------------------------------------------
// deriveConcept units
// ---------------------------------------------------------------------------

describe('deriveConcept', () => {
  test('replays evidence through the state-machine rule', () => {
    const rows = [1, 2, 3].map((id) => ({
      id,
      turnId: id,
      seq: id,
      conceptId: QUIERO,
      kind: id === 3 ? 'transfer_pass' : 'correct',
      detail: null,
      misconceptionId: null,
      recordedAt: id * 1000,
    }));
    const d = deriveConcept(DEFAULT_CURRICULUM, 'L', QUIERO, rows);
    expect(d.status).toBe('mastered');
    expect(d.derivation.evidenceIds).toEqual([1, 2, 3]);
    expect(d.derivation.rule).toBe('conservative-v1');
  });

  test('evidence from different sessions never collides in replay', () => {
    // Same turnId/kind, no seq: the row id namespaces the dedupe key.
    const rows = [1, 2].map((id) => ({
      id,
      turnId: 1,
      seq: null,
      conceptId: QUIERO,
      kind: 'correct',
      detail: null,
      misconceptionId: null,
      recordedAt: id * 1000,
    }));
    const d = deriveConcept(DEFAULT_CURRICULUM, 'L', QUIERO, rows);
    expect(d.correctCount).toBe(2);
  });

  test('progressionForConcept matches the state-machine fallback', () => {
    expect(progressionForConcept(DEFAULT_CURRICULUM, 'no-such-concept')).toEqual({
      minCorrectEvidence: 2,
      requireTransferPass: true,
    });
    expect(progressionForConcept(DEFAULT_CURRICULUM, QUIERO)).toEqual({
      minCorrectEvidence: 2,
      requireTransferPass: true,
    });
  });
});
