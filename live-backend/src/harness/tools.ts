/**
 * Teaching tool definitions + router (Layer B).
 *
 * These are the typed functions the pedagogical layer calls — via Responses
 * delegation in PR 3, and via the local HTTP dispatch endpoint until then.
 *
 * Design principles (brief §8):
 *  - every tool has a validated zod schema for input AND output;
 *  - read-only tools are separated from state-changing tools;
 *  - every state change goes through the state machine's transition
 *    validation — the router never mutates state directly;
 *  - idempotency keys (session_id + tool + turn_id, or an explicit key) make
 *    repeated/delegated calls safe: a repeated call returns the cached result
 *    and can never double-advance the learner;
 *  - every dispatch is logged as structured JSON with session/turn ids.
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Curriculum } from '../curriculum/types';
import { recordCounter, recordLatency } from '../metrics';
import { assembleTeachingContext, TeachingContextSchema } from './context';
import {
  applyMove,
  createHarnessState,
  CreateStateOptions,
  getObjective,
  getTeachingOptions,
  recordEvidence,
  validateMove,
} from './stateMachine';
import {
  ConceptIdSchema,
  EvidenceKind,
  HarnessState,
  TeachingMoveSchema,
} from './types';

export type ToolErrorCode =
  | 'unknown_tool'
  | 'unknown_session'
  | 'invalid_input'
  | 'invalid_move'
  | 'stale_turn'
  | 'session_not_active'
  | 'internal_error';

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'ToolError';
    this.code = code;
  }
}

const SessionIdSchema = z.string().min(1).max(128);
const TurnIdSchema = z.number().int().min(0);
const EvidenceKindSchema = z.enum([
  'correct',
  'incorrect',
  'unclear',
  'hint_used',
  'transfer_pass',
  'transfer_fail',
  'misconception_flagged',
  'utterance',
]);

const EvidenceInputSchema = z.object({
  kind: EvidenceKindSchema,
  detail: z.string().max(2000).optional(),
  misconceptionId: z.string().min(1).max(80).optional(),
});

const TeachingOptionSchema = z.object({
  move: TeachingMoveSchema,
  rationale: z.string(),
});

export interface ToolDefinition {
  name: string;
  description: string;
  readOnly: boolean;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: ToolHandlerContext, input: any) => unknown;
}

export interface ToolHandlerContext {
  store: HarnessStore;
  curriculum: Curriculum;
  now: () => number;
}

/** One concept's learner-level summary (derived from all past evidence). */
export interface LearnerConceptSummary {
  conceptId: string;
  status: string;
  correctCount: number;
  transferPassCount: number;
  openMisconceptions: string[];
}

/**
 * Cross-session learner summary (Layer D). Produced by the persistent store
 * from the durable tables; the in-memory store returns null.
 */
export interface LearnerSummary {
  learnerId: string;
  sessionsCount: number;
  masteredConcepts: string[];
  openMisconceptions: Array<{ conceptId: string; misconceptionId: string }>;
  concepts: LearnerConceptSummary[];
  /** Epoch ms of the learner's most recent session activity, if any. */
  lastActiveAt: number | null;
}

const LearnerSummarySchema = z.object({
  learnerId: z.string(),
  sessionsCount: z.number(),
  masteredConcepts: z.array(z.string()),
  openMisconceptions: z.array(
    z.object({ conceptId: z.string(), misconceptionId: z.string() }),
  ),
  concepts: z.array(
    z.object({
      conceptId: z.string(),
      status: z.string(),
      correctCount: z.number(),
      transferPassCount: z.number(),
      openMisconceptions: z.array(z.string()),
    }),
  ),
  lastActiveAt: z.number().nullable(),
});

/** In-memory authoritative store. PR 4 adds Postgres behind this interface. */
export class HarnessStore {
  private readonly states = new Map<string, HarnessState>();

  /** Register a freshly created state. Throws if the session already exists. */
  insert(state: HarnessState): void {
    if (this.states.has(state.sessionId)) {
      throw new Error(`harness state already exists for session "${state.sessionId}"`);
    }
    this.states.set(state.sessionId, state);
  }

  /**
   * Create and register the harness state for a new session. The persistent
   * store (PR 4) overrides this to seed prior learner knowledge first.
   */
  async prepareSession(opts: CreateStateOptions): Promise<HarnessState> {
    const state = createHarnessState(opts);
    this.insert(state);
    return state;
  }

  /** Flush pending durable writes. No-op for the in-memory store. */
  async flush(): Promise<void> {
    return undefined;
  }

  /**
   * Archive one transcript utterance (speaker + text) for the durable
   * transcript record. No-op for the in-memory store; utterance
   * *observations* still flow through recordEvidence as before.
   */
  recordUtterance(_utterance: {
    sessionId: string;
    speaker: 'user' | 'assistant';
    text: string;
    turnId: number;
    seq: number;
  }): void {
    // in-memory only: nothing durable to write
  }

  /**
   * Cross-session learner summary, or null when the store only holds the
   * current session (in-memory). Surfaced by get_learner_history.
   */
  getLearnerSummary(_learnerId: string): LearnerSummary | null {
    return null;
  }

  get(sessionId: string): HarnessState | undefined {
    return this.states.get(sessionId);
  }

  /**
   * Apply a pure transition function and store the result. The function must
   * not mutate its input (state machine functions are pure).
   */
  update(sessionId: string, fn: (s: HarnessState) => HarnessState): HarnessState {
    const current = this.states.get(sessionId);
    if (!current) throw new ToolError('unknown_session', `no harness state for session "${sessionId}"`);
    const next = fn(current);
    this.states.set(sessionId, next);
    return next;
  }

  delete(sessionId: string): void {
    this.states.delete(sessionId);
  }

  get size(): number {
    return this.states.size;
  }
}

function requireActiveState(ctx: ToolHandlerContext, sessionId: string): HarnessState {
  const state = ctx.store.get(sessionId);
  if (!state) throw new ToolError('unknown_session', `no harness state for session "${sessionId}"`);
  return state;
}

const TOOLS: Record<string, ToolDefinition> = {
  get_learning_context: {
    name: 'get_learning_context',
    description:
      'Read the full preloaded teaching context: current objective, concept statuses, recent moves, and precomputed next teaching options.',
    readOnly: true,
    inputSchema: z.object({ sessionId: SessionIdSchema }),
    outputSchema: TeachingContextSchema,
    handler: (ctx, input) => {
      const state = requireActiveState(ctx, input.sessionId);
      return assembleTeachingContext(ctx.curriculum, state);
    },
  },

  get_current_objective: {
    name: 'get_current_objective',
    description: 'Read the current learning objective and per-concept progress toward it.',
    readOnly: true,
    inputSchema: z.object({ sessionId: SessionIdSchema }),
    outputSchema: z.object({
      objective: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
      }),
      progress: z.object({
        masteredRequired: z.number(),
        requiredTotal: z.number(),
        conceptsTotal: z.number(),
      }),
      conceptStatuses: z.array(
        z.object({ conceptId: z.string(), status: z.string() }),
      ),
    }),
    handler: (ctx, input) => {
      const state = requireActiveState(ctx, input.sessionId);
      const objective = getObjective(ctx.curriculum, state);
      const required = objective.progression.requiredConcepts;
      return {
        objective: { id: objective.id, title: objective.title, description: objective.description },
        progress: {
          masteredRequired: required.filter((c) => state.concepts[c]?.status === 'mastered').length,
          requiredTotal: required.length,
          conceptsTotal: objective.conceptIds.length,
        },
        conceptStatuses: objective.conceptIds.map((conceptId) => ({
          conceptId,
          status: state.concepts[conceptId]?.status ?? 'unknown',
        })),
      };
    },
  },

  assess_understanding: {
    name: 'assess_understanding',
    description:
      'Record one piece of evidence about the learner (correct/incorrect/unclear answer, transfer result, flagged misconception) and get the updated concept status plus valid next teaching moves. Deterministic — no model calls.',
    readOnly: false,
    inputSchema: z.object({
      sessionId: SessionIdSchema,
      turnId: TurnIdSchema,
      conceptId: ConceptIdSchema,
      evidence: EvidenceInputSchema,
      seq: z.number().int().min(0).optional(),
    }),
    outputSchema: z.object({
      recorded: z.boolean(),
      conceptId: z.string(),
      status: z.string(),
      correctCount: z.number(),
      incorrectCount: z.number(),
      transferPassCount: z.number(),
      openMisconceptions: z.array(z.string()),
      suggestedMoves: z.array(TeachingOptionSchema),
    }),
    handler: (ctx, input) => {
      const before = requireActiveState(ctx, input.sessionId);
      const evidenceCountBefore = before.evidence.length;
      const state = ctx.store.update(input.sessionId, (s) =>
        recordEvidence(
          ctx.curriculum,
          s,
          {
            turnId: input.turnId,
            conceptId: input.conceptId,
            kind: input.evidence.kind as EvidenceKind,
            detail: input.evidence.detail,
            misconceptionId: input.evidence.misconceptionId,
            seq: input.seq,
          },
          ctx.now(),
        ),
      );
      const cs = state.concepts[input.conceptId];
      return {
        recorded: state.evidence.length > evidenceCountBefore,
        conceptId: input.conceptId,
        status: cs.status,
        correctCount: cs.correctCount,
        incorrectCount: cs.incorrectCount,
        transferPassCount: cs.transferPassCount,
        openMisconceptions: cs.openMisconceptions,
        suggestedMoves: getTeachingOptions(ctx.curriculum, state, input.conceptId).slice(0, 5),
      };
    },
  },

  get_teaching_options: {
    name: 'get_teaching_options',
    description:
      'List the currently valid teaching moves (precomputed, pedagogically ordered). The voice model chooses among these on the fast path; anything not listed is rejected by the harness.',
    readOnly: true,
    inputSchema: z.object({ sessionId: SessionIdSchema, conceptId: ConceptIdSchema.optional() }),
    outputSchema: z.object({ options: z.array(TeachingOptionSchema) }),
    handler: (ctx, input) => {
      const state = requireActiveState(ctx, input.sessionId);
      return { options: getTeachingOptions(ctx.curriculum, state, input.conceptId) };
    },
  },

  commit_teaching_decision: {
    name: 'commit_teaching_decision',
    description:
      'Commit one teaching move. The harness validates the move against curriculum and session state; invalid moves are rejected with a reason. turnId must be exactly current turn + 1 — stale delegated decisions are rejected.',
    readOnly: false,
    inputSchema: z.object({
      sessionId: SessionIdSchema,
      turnId: TurnIdSchema,
      move: TeachingMoveSchema,
      rationale: z.string().max(1000).optional(),
    }),
    outputSchema: z.object({
      committed: z.boolean(),
      turn: z.number(),
      move: TeachingMoveSchema,
      sessionStatus: z.string(),
      currentObjectiveId: z.string(),
    }),
    handler: (ctx, input) => {
      const state = requireActiveState(ctx, input.sessionId);
      if (state.status !== 'teaching' && state.status !== 'initializing') {
        throw new ToolError('session_not_active', `session is "${state.status}"`);
      }
      if (input.turnId !== state.turn + 1) {
        throw new ToolError(
          'stale_turn',
          `expected turn ${state.turn + 1} for this session, got ${input.turnId} — the decision was computed from outdated state`,
        );
      }
      const validation = validateMove(ctx.curriculum, state, input.move);
      if (!validation.ok) {
        throw new ToolError('invalid_move', validation.reason);
      }
      const next = ctx.store.update(input.sessionId, (s) =>
        applyMove(ctx.curriculum, s, input.move, { rationale: input.rationale, now: ctx.now() }),
      );
      recordCounter('teaching.move', input.move.move);
      return {
        committed: true,
        turn: next.turn,
        move: input.move,
        sessionStatus: next.status,
        currentObjectiveId: next.currentObjectiveId,
      };
    },
  },

  record_learning_evidence: {
    name: 'record_learning_evidence',
    description:
      'Record a neutral observation (e.g. transcript utterance) without assessing. Idempotent: repeats with the same key are ignored. Out-of-order turnIds are accepted.',
    readOnly: false,
    inputSchema: z.object({
      sessionId: SessionIdSchema,
      turnId: TurnIdSchema,
      conceptId: ConceptIdSchema.optional(),
      kind: EvidenceKindSchema,
      detail: z.string().max(2000).optional(),
      misconceptionId: z.string().min(1).max(80).optional(),
      seq: z.number().int().min(0).optional(),
    }),
    outputSchema: z.object({
      recorded: z.boolean(),
      evidenceCount: z.number(),
    }),
    handler: (ctx, input) => {
      const before = requireActiveState(ctx, input.sessionId);
      const state = ctx.store.update(input.sessionId, (s) =>
        recordEvidence(
          ctx.curriculum,
          s,
          {
            turnId: input.turnId,
            conceptId: input.conceptId,
            kind: input.kind as EvidenceKind,
            detail: input.detail,
            misconceptionId: input.misconceptionId,
            seq: input.seq,
          },
          ctx.now(),
        ),
      );
      return {
        recorded: state.evidence.length > before.evidence.length,
        evidenceCount: state.evidence.length,
      };
    },
  },

  get_learner_history: {
    name: 'get_learner_history',
    description:
      'Read the learner history available to the harness: in-session evidence plus, when the backend runs with Postgres (Layer D), the cross-session learner summary (mastered concepts, open misconceptions).',
    readOnly: true,
    inputSchema: z.object({ sessionId: SessionIdSchema, learnerId: z.string().max(128).optional() }),
    outputSchema: z.object({
      learnerId: z.string().nullable(),
      sessionId: z.string(),
      turnsCompleted: z.number(),
      evidenceKinds: z.record(z.string(), z.number()),
      masteredConcepts: z.array(z.string()),
      crossSession: LearnerSummarySchema.nullable(),
      note: z.string(),
    }),
    handler: (ctx, input) => {
      const state = requireActiveState(ctx, input.sessionId);
      const evidenceKinds: Record<string, number> = {};
      for (const e of state.evidence) {
        evidenceKinds[e.kind] = (evidenceKinds[e.kind] ?? 0) + 1;
      }
      const learnerId = state.learnerId ?? input.learnerId ?? null;
      return {
        learnerId,
        sessionId: state.sessionId,
        turnsCompleted: state.turn,
        evidenceKinds,
        masteredConcepts: Object.entries(state.concepts)
          .filter(([, cs]) => cs.status === 'mastered')
          .map(([id]) => id),
        crossSession: learnerId ? ctx.store.getLearnerSummary(learnerId) : null,
        note: 'crossSession is populated when the backend runs with Postgres (Layer D); null for the in-memory store.',
      };
    },
  },
};

export function listTools(): ToolDefinition[] {
  return Object.values(TOOLS);
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS[name];
}

/** Stable JSON serialization for idempotency-key hashing (key order independent). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface DispatchRequest {
  sessionId: string;
  tool: string;
  input: unknown;
  /** Overrides the default idempotency key for write tools. */
  idempotencyKey?: string;
}

export interface DispatchResult {
  ok: boolean;
  result?: unknown;
  error?: { code: ToolErrorCode; detail?: string };
}

export interface RouterLogEntry {
  ts: number;
  sessionId: string;
  tool: string;
  turnId?: number;
  readOnly: boolean;
  ok: boolean;
  errorCode?: string;
  replayed?: boolean;
  durationMs: number;
}

/**
 * Dispatches tool calls with schema validation, idempotency, and structured
 * logging. A repeated write-tool call with the same key returns the cached
 * result — it can never advance the learner twice.
 */
export class ToolRouter {
  private readonly idempotencyCache = new Map<string, DispatchResult>();

  constructor(
    private readonly ctx: ToolHandlerContext,
    private readonly log: (entry: RouterLogEntry) => void = (e) =>
      console.log(JSON.stringify({ component: 'harness-tools', ...e })),
  ) {}

  /**
   * Default idempotency key for write tools: session + tool + turn + payload
   * hash. An identical retry replays the cached result; a *different* payload
   * for the same turn is a conflicting decision and runs through validation
   * (where the stale-turn check rejects it) instead of being masked as a
   * replay.
   */
  private defaultKey(
    req: DispatchRequest,
    def: ToolDefinition,
    parsedInput: unknown,
  ): string | null {
    if (def.readOnly) return null;
    if (req.idempotencyKey) return `explicit:${req.idempotencyKey}`;
    const input = parsedInput as { turnId?: unknown; sessionId?: unknown };
    const turnId = typeof input.turnId === 'number' ? input.turnId : 'no-turn';
    const { sessionId: _omit, ...rest } = input as Record<string, unknown>;
    void _omit;
    const payloadHash = createHash('sha256')
      .update(stableStringify(rest))
      .digest('hex')
      .slice(0, 16);
    return `${req.sessionId}:${def.name}:${turnId}:${payloadHash}`;
  }

  dispatch(req: DispatchRequest): DispatchResult {
    const start = this.ctx.now();
    const def = TOOLS[req.tool];
    const done = (
      result: DispatchResult,
      opts: { replayed?: boolean; turnId?: number } = {},
    ): DispatchResult => {
      const durationMs = this.ctx.now() - start;
      recordLatency('tools.exec_ms', durationMs);
      this.log({
        ts: start,
        sessionId: req.sessionId,
        tool: req.tool,
        turnId: opts.turnId,
        readOnly: def?.readOnly ?? false,
        ok: result.ok,
        errorCode: result.error?.code,
        replayed: opts.replayed,
        durationMs,
      });
      return result;
    };

    if (!def) {
      return done({ ok: false, error: { code: 'unknown_tool', detail: `unknown tool "${req.tool}"` } });
    }

    const inputRecord =
      req.input !== null && typeof req.input === 'object' && !Array.isArray(req.input)
        ? (req.input as Record<string, unknown>)
        : null;
    if (!inputRecord) {
      return done({
        ok: false,
        error: { code: 'invalid_input', detail: 'input must be a JSON object' },
      });
    }
    const parsed = def.inputSchema.safeParse({ ...inputRecord, sessionId: req.sessionId });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return done({
        ok: false,
        error: {
          code: 'invalid_input',
          detail: `${first?.path.join('.') ?? 'input'}: ${first?.message}`,
        },
      });
    }
    const input = parsed.data;
    const turnId = typeof input.turnId === 'number' ? input.turnId : undefined;

    const key = this.defaultKey(req, def, input);
    if (key) {
      const cached = this.idempotencyCache.get(key);
      if (cached) return done(cached, { replayed: true, turnId });
    }

    let result: DispatchResult;
    try {
      const output = def.handler(this.ctx, input);
      const outParsed = def.outputSchema.safeParse(output);
      if (!outParsed.success) {
        result = {
          ok: false,
          error: { code: 'internal_error', detail: 'tool output failed schema validation' },
        };
      } else {
        result = { ok: true, result: outParsed.data };
      }
    } catch (err) {
      if (err instanceof ToolError) {
        result = { ok: false, error: { code: err.code, detail: err.message } };
      } else {
        result = {
          ok: false,
          error: { code: 'internal_error', detail: err instanceof Error ? err.message : 'unknown' },
        };
      }
    }

    if (key && result.ok) this.idempotencyCache.set(key, result);
    return done(result, { turnId });
  }

  /** For tests: how many idempotent results are cached. */
  get cacheSize(): number {
    return this.idempotencyCache.size;
  }
}
