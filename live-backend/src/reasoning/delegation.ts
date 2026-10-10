/**
 * Responses delegation for GPT-Live (Layer C).
 *
 * ADR-001 D3: the pedagogical reasoning layer maps to GPT-Live's Responses
 * delegation. The Live voice model handles routine exchanges from preloaded
 * context (fast path); when it needs deeper reasoning it delegates, and the
 * delegated backend model calls our typed harness tools. Tool execution
 * happens HERE, in our backend, with validation — the harness stays
 * authoritative even when the voice model proposes a different course.
 *
 * Event flow (verified against official docs):
 * - Session creation carries `delegation: {type: 'responses', responses: {...}}`.
 * - Delegation lifecycle events (`delegation.*`) arrive on the sideband; the
 *   manager records the delegation id.
 * - Nested Responses events arrive as `response.event` frames carrying the
 *   inner Responses API event in `event.event` plus the outer `delegation_id`.
 * - Complete function items arrive in `response.output_item.done`; the manager
 *   collects them and waits for `response.completed` before executing.
 * - For each call: execute through ToolRouter (validation + idempotency), then
 *   send `response.item.create` with `function_call_output` for the original
 *   `call_id`, then ONE bodyless `response.create` to continue backend work.
 * - Duplicate call ids never re-execute (the router's idempotency cache is keyed
 *   on the call id explicitly).
 *
 * Everything is hermetic in tests: the OpenAI boundary is the injected sender
 * and the event shapes below.
 */

import { Curriculum } from '../curriculum/types';
import { HarnessStore, ToolRouter } from '../harness/tools';

/** A Responses function tool definition handed to the delegated backend. */
export interface ResponsesFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
}

const SESSION_ID_PROP = {
  sessionId: { type: 'string', description: 'The live session id.' },
};

const TURN_ID_PROP = {
  turnId: {
    type: 'integer',
    description:
      'The 1-based turn this evidence/decision belongs to. Omit to let the harness resolve it from session state.',
  },
};

function toolDef(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): ResponsesFunctionTool {
  return {
    type: 'function',
    name,
    description,
    parameters: {
      type: 'object',
      properties: { ...SESSION_ID_PROP, ...properties },
      required: ['sessionId', ...required],
      additionalProperties: false,
    },
  };
}

/**
 * The harness tools as the delegated backend model sees them. Schemas are
 * deliberately permissive here — the ToolRouter re-validates every call with
 * zod, and that validation is the enforcement point (hard control).
 */
export const DELEGATION_TOOLS: ResponsesFunctionTool[] = [
  toolDef(
    'get_learning_context',
    'Read the full preloaded teaching context: current objective, concept statuses, recent moves, and the precomputed next teaching options.',
    {},
    [],
  ),
  toolDef(
    'get_current_objective',
    'Read the current learning objective and per-concept progress toward it.',
    {},
    [],
  ),
  toolDef(
    'assess_understanding',
    'Record one piece of evidence about the learner (correct/incorrect/unclear answer, transfer result, flagged misconception) and get the updated concept status plus valid next teaching moves. Use this when the learner has just answered. Deterministic — no extra model calls.',
    {
      ...TURN_ID_PROP,
      conceptId: { type: 'string', description: 'The curriculum concept id being assessed.' },
      evidence: {
        type: 'object',
        description: 'The observed evidence.',
        properties: {
          kind: {
            type: 'string',
            enum: ['correct', 'incorrect', 'unclear', 'hint_used', 'transfer_pass', 'transfer_fail', 'misconception_flagged'],
          },
          detail: { type: 'string', description: 'Transcript excerpt or note, max 2000 chars.' },
          misconceptionId: { type: 'string', description: 'Registered misconception id, when flagging one.' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
    ['conceptId', 'evidence'],
  ),
  toolDef(
    'get_teaching_options',
    'List the currently valid teaching moves (precomputed, pedagogically ordered). Choose among these; anything not listed will be rejected by the harness.',
    {
      conceptId: { type: 'string', description: 'Optional: restrict to one concept.' },
    },
    [],
  ),
  toolDef(
    'commit_teaching_decision',
    'Commit ONE teaching move. The harness validates it against curriculum and session state; invalid moves are rejected with a reason. Use a teaching option from get_teaching_options to avoid rejection.',
    {
      ...TURN_ID_PROP,
      move: {
        type: 'object',
        description:
          'The teaching move. One of: introduce_concept, ask_discovery_question, probe_understanding, give_hint (needs hintId), decompose_problem (needs subConcepts), give_counterexample (needs verified counterexample text), revisit_prerequisite (needs prerequisiteId), correct_misconception (needs misconceptionId), reveal_answer (needs justification), test_transfer (needs an unfamiliar example), reinforce_concept, advance_objective.',
        properties: {
          move: { type: 'string' },
          conceptId: { type: 'string' },
          prompt: { type: 'string' },
          hintId: { type: 'string' },
          subConcepts: { type: 'array', items: { type: 'string' } },
          counterexample: { type: 'string' },
          prerequisiteId: { type: 'string' },
          misconceptionId: { type: 'string' },
          justification: { type: 'string' },
          example: { type: 'string' },
          objectiveId: { type: 'string' },
          toObjectiveId: { type: 'string' },
        },
        required: ['move'],
        additionalProperties: true,
      },
      rationale: { type: 'string', description: 'Why this move now (max 1000 chars).' },
    },
    ['move'],
  ),
  toolDef(
    'record_learning_evidence',
    'Record a neutral observation (e.g. a transcript utterance) without assessing. Idempotent.',
    {
      ...TURN_ID_PROP,
      conceptId: { type: 'string' },
      kind: {
        type: 'string',
        enum: ['correct', 'incorrect', 'unclear', 'hint_used', 'transfer_pass', 'transfer_fail', 'misconception_flagged', 'utterance'],
      },
      detail: { type: 'string' },
      misconceptionId: { type: 'string' },
    },
    ['kind'],
  ),
  toolDef(
    'get_learner_history',
    'Read the learner history available to the harness: in-session evidence plus, when the backend runs with Postgres (Layer D), the cross-session learner summary.',
    {
      learnerId: { type: 'string' },
    },
    [],
  ),
];

export function delegationToolNames(): string[] {
  return DELEGATION_TOOLS.map((t) => t.name);
}

/**
 * Pedagogical policy for the delegated backend (Layer C).
 *
 * From the brief §6: this is the intellectual core. It is expressed as
 * instructions to the reasoning model AND as harness-enforced rules — the
 * instructions guide, the harness enforces. Never the reverse.
 */
export function buildBackendInstructions(curriculum: Curriculum): string {
  return [
    `You are the pedagogical reasoning layer of a real-time teacher using the Language Transfer "Thinking Method" for ${curriculum.subjectName}.`,
    'The voice model speaks to the learner; you decide HOW to teach. You act only through the teaching tools — every decision is validated by the harness.',
    '',
    'Pedagogical policy (non-negotiable):',
    '- Favor reasoning over memorization. Guide discovery with carefully chosen questions; do not deliver answers.',
    '- Never reveal an answer prematurely. When the learner struggles, escalate hints (use get_teaching_options) that preserve productive thinking.',
    '- Diagnose before correcting: use assess_understanding to record evidence, then pick among the valid teaching options.',
    '- Correct misconceptions kindly, without shaming. Normalize the error, hand back a process.',
    '- Never fabricate grammatical rules or examples. Use only verified curriculum knowledge; teach only concepts whose prerequisites are met.',
    '- A correct answer is evidence, not mastery: test with an unfamiliar transfer example before advancing.',
    '- Recognize when productive struggle has become unproductive: then a clear explanation is warranted — endless questioning is a failure mode.',
    '- Keep spoken guidance brief; the voice model turns your decisions into speech.',
    '',
    'Tool discipline:',
    '- Always assess_understanding after a learner answer before committing a teaching move.',
    '- Commit exactly one move per turn via commit_teaching_decision, choosing from get_teaching_options. Rejected moves come back with a reason — adapt, do not retry blindly.',
    '- For unfamiliar learner behavior with no matching option, record the evidence and choose the closest valid move; do not invent moves.',
  ].join('\n');
}

export interface DelegationConfig {
  type: 'responses';
  responses: {
    model: string;
    instructions: string;
    tools: ResponsesFunctionTool[];
    tool_choice: 'auto';
    parallel_tool_calls: boolean;
    max_output_tokens: number;
  };
}

export interface DelegationConfigOptions {
  model?: string;
  maxOutputTokens?: number;
  parallelToolCalls?: boolean;
}

const DEFAULT_DELEGATION_MODEL = 'gpt-5.6-terra';

/**
 * Build the delegation block for session creation. Model is configurable
 * (LIVE_DELEGATION_MODEL); gpt-5.6-luna is the documented cost-sensitive
 * alternative.
 */
export function buildDelegationConfig(
  curriculum: Curriculum,
  opts: DelegationConfigOptions = {},
): DelegationConfig {
  return {
    type: 'responses',
    responses: {
      model: opts.model ?? DEFAULT_DELEGATION_MODEL,
      instructions: buildBackendInstructions(curriculum),
      tools: DELEGATION_TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: opts.parallelToolCalls ?? true,
      max_output_tokens: opts.maxOutputTokens ?? 1024,
    },
  };
}

export function defaultDelegationModel(): string {
  return DEFAULT_DELEGATION_MODEL;
}

/** Outbound command channel (the sideband socket in production, a fake in tests). */
export interface DelegationSender {
  sendCommand(command: Record<string, unknown>): void;
}

export interface DelegationLogFields {
  sessionId?: string;
  delegationId?: string;
  callId?: string;
  tool?: string;
  [key: string]: unknown;
}

export interface DelegationManagerDeps {
  router: ToolRouter;
  store: HarnessStore;
  sender: DelegationSender;
  log?: (message: string, fields?: DelegationLogFields) => void;
}

interface PendingCall {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
}

interface DelegationRecord {
  delegationId: string;
  sessionId: string;
  createdAt: number;
  pending: PendingCall[];
  /** Call ids already executed — a second delivery never re-executes. */
  executed: Set<string>;
}

/**
 * Owns the delegation side of a GPT-Live session: routes delegation/Responses
 * events from the sideband, executes backend function calls through the
 * ToolRouter, and returns results into the session.
 *
 * Ownership rules:
 * - The manager resolves `sessionId` (from the session context) and `turnId`
 *   (from harness state: current turn for evidence, turn+1 for commits) when
 *   the backend model omits them — the model reasons pedagogically, the
 *   harness owns bookkeeping.
 * - Guardrail blocks (set via `setToolBlock`) make write-tool execution
 *   return a blocked error to the model instead of running.
 */
export class DelegationManager {
  private readonly delegations = new Map<string, DelegationRecord>();
  private readonly blockedSessions = new Set<string>();

  constructor(private readonly deps: DelegationManagerDeps) {}

  private log(message: string, fields: DelegationLogFields = {}): void {
    (this.deps.log ?? (() => undefined))(message, fields);
  }

  /** Guardrail hook: block (or unblock) write-tool execution for a session. */
  setToolBlock(sessionId: string, blocked: boolean, ttlMs = 60_000): void {
    if (blocked) {
      this.blockedSessions.add(sessionId);
      const timer = setTimeout(() => this.blockedSessions.delete(sessionId), ttlMs);
      // Do not hold the process open for a guardrail timer.
      if (typeof timer === 'object' && 'unref' in timer) (timer as { unref(): void }).unref();
    } else {
      this.blockedSessions.delete(sessionId);
    }
  }

  isBlocked(sessionId: string): boolean {
    return this.blockedSessions.has(sessionId);
  }

  /**
   * Route one sideband event. Handles `delegation.*` lifecycle frames and
   * nested `response.event` frames carrying Responses API events.
   */
  handleEvent(sessionId: string, event: Record<string, unknown>): void {
    const type = typeof event.type === 'string' ? event.type : '';
    if (type.startsWith('delegation.')) {
      this.onDelegationLifecycle(sessionId, type, event);
      return;
    }
    if (type === 'response.event') {
      this.onNestedResponseEvent(sessionId, event);
      return;
    }
  }

  private onDelegationLifecycle(
    sessionId: string,
    type: string,
    event: Record<string, unknown>,
  ): void {
    const delegationId =
      typeof event.delegation_id === 'string' ? event.delegation_id : null;
    if (type === 'delegation.created' && delegationId) {
      this.delegations.set(delegationId, {
        delegationId,
        sessionId,
        createdAt: Date.now(),
        pending: [],
        executed: new Set(),
      });
      this.log('delegation created', { sessionId, delegationId });
      return;
    }
    if ((type === 'delegation.completed' || type === 'delegation.failed') && delegationId) {
      this.log(`delegation ${type === 'delegation.failed' ? 'failed' : 'completed'}`, {
        sessionId,
        delegationId,
      });
      this.delegations.delete(delegationId);
    }
  }

  private onNestedResponseEvent(sessionId: string, frame: Record<string, unknown>): void {
    const delegationId =
      typeof frame.delegation_id === 'string' ? frame.delegation_id : null;
    const inner = frame.event as Record<string, unknown> | undefined;
    if (!delegationId || !inner || typeof inner.type !== 'string') return;
    const record = this.delegations.get(delegationId);
    if (!record) {
      // Delegation unknown (e.g. created before attach). Track it so nested
      // events still work.
      this.delegations.set(delegationId, {
        delegationId,
        sessionId,
        createdAt: Date.now(),
        pending: [],
        executed: new Set(),
      });
    }
    const rec = this.delegations.get(delegationId);
    if (!rec) return;

    const innerType = inner.type as string;
    if (innerType === 'response.output_item.done') {
      const item = inner.item as Record<string, unknown> | undefined;
      if (item && item.type === 'function_call' && typeof item.call_id === 'string') {
        rec.pending.push({
          callId: item.call_id as string,
          tool: typeof item.name === 'string' ? (item.name as string) : '',
          args: this.parseArgs(item.arguments),
        });
        this.log('function call collected', {
          sessionId,
          delegationId,
          callId: item.call_id as string,
          tool: typeof item.name === 'string' ? (item.name as string) : '',
        });
      }
      return;
    }
    if (innerType === 'response.completed') {
      this.executeBatch(rec);
    }
  }

  private parseArgs(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // fall through to empty args; validation will reject
      }
    }
    return {};
  }

  /** Execute a completed response's collected calls, then continue backend work. */
  private executeBatch(rec: DelegationRecord): void {
    const { sessionId, delegationId } = rec;
    const batch = rec.pending.splice(0, rec.pending.length);
    for (const call of batch) {
      if (rec.executed.has(call.callId)) {
        this.log('duplicate call id skipped', {
          sessionId,
          delegationId,
          callId: call.callId,
          tool: call.tool,
        });
        continue;
      }
      rec.executed.add(call.callId);
      const output = this.executeOne(sessionId, call);
      this.deps.sender.sendCommand({
        type: 'response.item.create',
        delegation_id: delegationId,
        item: {
          type: 'function_call_output',
          call_id: call.callId,
          output: JSON.stringify(output),
        },
      });
    }
    // One bodyless response.create continues the delegated backend work.
    this.deps.sender.sendCommand({ type: 'response.create', delegation_id: delegationId });
    this.log('delegation batch executed', {
      sessionId,
      delegationId,
      calls: batch.length,
    });
  }

  private executeOne(sessionId: string, call: PendingCall): Record<string, unknown> {
    const args = this.resolveArgs(sessionId, call);
    const isWrite = call.tool !== 'get_learning_context'
      && call.tool !== 'get_current_objective'
      && call.tool !== 'get_teaching_options'
      && call.tool !== 'get_learner_history';
    if (isWrite && this.isBlocked(sessionId)) {
      this.log('tool execution blocked by guardrail', {
        sessionId,
        callId: call.callId,
        tool: call.tool,
      });
      return { ok: false, error: { code: 'blocked', detail: 'guardrail block in effect for this session' } };
    }
    const result = this.deps.router.dispatch({
      sessionId,
      tool: call.tool,
      input: args,
      // The OpenAI call id is the idempotency key: a re-delivered call can
      // never double-advance the learner.
      idempotencyKey: `delegation:${call.callId}`,
    });
    return result.ok
      ? { ok: true, result: result.result }
      : { ok: false, error: result.error };
  }

  /**
   * Fill in bookkeeping the model should not own: sessionId always comes from
   * the session context; turnId resolves from harness state when omitted
   * (current turn for evidence, next turn for commits).
   */
  private resolveArgs(sessionId: string, call: PendingCall): Record<string, unknown> {
    const args: Record<string, unknown> = { ...call.args, sessionId };
    if (args.turnId === undefined) {
      const state = this.deps.store.get(sessionId);
      if (state) {
        args.turnId = call.tool === 'commit_teaching_decision' ? state.turn + 1 : state.turn;
      }
    }
    return args;
  }

  /** For tests: number of tracked delegations. */
  get trackedDelegations(): number {
    return this.delegations.size;
  }
}
