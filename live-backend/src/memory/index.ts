/**
 * Layer D public surface: migration runner, persistent store, retention.
 */
export { MIGRATIONS_DIR, runMigrations } from './migrate';
export { PersistentHarnessStore, evidenceDedupeKey } from './pgStore';
export type { PersistentStoreOptions } from './pgStore';
export { deriveConcept, progressionForConcept } from './mastery';
export type { DerivedConcept, EvidenceRow } from './mastery';
export { purgeExpired } from './retention';
export type { PurgeResult } from './retention';
