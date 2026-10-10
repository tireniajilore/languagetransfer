/**
 * DelegationManager tests: event routing, function-call collection and
 * execution, result submission, idempotency, turn resolution, guardrail
 * blocks — all with a mocked OpenAI boundary (the FakeSender).
 */
import { describe, expect, it } from 'vitest';
import {
  buildBackendInstructions,
  buildDelegationConfig,
  DELEGATION_TOOLS,
  defaultDelegationModel,
  DelegationManager,
  delegationToolNames,
} from '../delegation';
import { CUR, FakeSender, makeHarness, startCopula } from './helpers';

function makeManager(sessionId = 's-test') {
  const fx = makeHarness(sessionId);
  const sender = new FakeSender();
  const manager = new DelegationManager({
    router: fx.router,
    store: fx.store,
    sender,
    log: () => undefined,
  });
  return { fx, sender, manager };
}

function delegationCreated(delegationId: string): Record<string, unknown> {
  return { type: 'delegation.created', delegation_id: delegationId };
}

function nestedEvent(delegationId: string, inner: Record<string, unknown>): Record<string, unknown> {
  return { type: 'response.event', delegation_id: delegationId, event: inner };
}

function outputItemDone(delegationId: string, callId: string, tool: string, args: unknown) {
  return nestedEvent(delegationId, {
    type: 'response.output_item.done',
    item: {
      type: 'function_call',
      call_id: callId,
      name: tool,
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    },
  });
}

describe('delegation config', () => {
  it('builds a responses delegation block with all seven tools', () => {
    const config = buildDelegationConfig(CUR);
    expect(config.type).toBe('responses');
    expect(config.responses.model).toBe('gpt-5.6-terra');
    expect(config.responses.tool_choice).toBe('auto');
    expect(config.responses.tools).toHaveLength(7);
    expect(delegationToolNames()).toContain('commit_teaching_decision');
    expect(delegationToolNames()).toContain('assess_understanding');
  });

  it('supports a configurable model (luna as cost option)', () => {
    const config = buildDelegationConfig(CUR, { model: 'gpt-5.6-luna' });
    expect(config.responses.model).toBe('gpt-5.6-luna');
  });

  it('exposes the default model constant', () => {
    expect(defaultDelegationModel()).toBe('gpt-5.6-terra');
  });

  it('backend instructions encode the pedagogical policy', () => {
    const instructions = buildBackendInstructions(CUR);
    expect(instructions).toContain('reasoning over memorization');
    expect(instructions).toContain('Never reveal an answer prematurely');
    expect(instructions).toContain('without shaming');
    expect(instructions).toContain('Never fabricate');
    expect(instructions).toContain('correct answer is evidence, not mastery');
  });

  it('every delegation tool has a valid function schema shape', () => {
    for (const t of DELEGATION_TOOLS) {
      expect(t.type).toBe('function');
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.parameters.type).toBe('object');
      expect(t.parameters.required).toContain('sessionId');
    }
  });
});

describe('DelegationManager event routing', () => {
  it('tracks delegation.created and routes nested events', () => {
    const { manager } = makeManager();
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    expect(manager.trackedDelegations).toBe(1);
    manager.handleEvent('s-test', { type: 'delegation.completed', delegation_id: 'dlg_1' });
    expect(manager.trackedDelegations).toBe(0);
  });

  it('ignores non-delegation events', () => {
    const { manager } = makeManager();
    manager.handleEvent('s-test', { type: 'session.started' });
    expect(manager.trackedDelegations).toBe(0);
  });

  it('executes a collected function call and submits results', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx);
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent(
      's-test',
      outputItemDone('dlg_1', 'call_1', 'get_current_objective', {}),
    );
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));

    const outputs = sender.ofType('response.item.create');
    expect(outputs).toHaveLength(1);
    const item = outputs[0].item as { type: string; call_id: string; output: string };
    expect(item.type).toBe('function_call_output');
    expect(item.call_id).toBe('call_1');
    expect(JSON.parse(item.output).ok).toBe(true);

    const continues = sender.ofType('response.create');
    expect(continues).toHaveLength(1);
    expect(continues[0].delegation_id).toBe('dlg_1');
  });

  it('executes a write tool through the router with validation', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx);
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent(
      's-test',
      outputItemDone('dlg_1', 'call_2', 'assess_understanding', {
        conceptId: 'es-copula',
        evidence: { kind: 'correct', detail: 'said "es" clearly' },
      }),
    );
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));

    const outputs = sender.ofType('response.item.create');
    const payload = JSON.parse((outputs[0].item as { output: string }).output);
    expect(payload.ok).toBe(true);
    expect(payload.result.recorded).toBe(true);
    const state = fx.store.get('s-test');
    expect(state?.concepts['es-copula'].correctCount).toBe(1);
  });

  it('resolves turnId from harness state when the model omits it', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx); // turn is now 1
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent(
      's-test',
      outputItemDone('dlg_1', 'call_3', 'commit_teaching_decision', {
        move: { move: 'ask_discovery_question', conceptId: 'es-copula' },
      }),
    );
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));
    const payload = JSON.parse(
      (sender.ofType('response.item.create')[0].item as { output: string }).output,
    );
    expect(payload.ok).toBe(true);
    expect(payload.result.turn).toBe(2); // resolved to state.turn + 1
  });

  it('never re-executes a duplicate call id', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx);
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    const call = outputItemDone('dlg_1', 'call_dup', 'assess_understanding', {
      conceptId: 'es-copula',
      evidence: { kind: 'correct' },
    });
    manager.handleEvent('s-test', call);
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));
    // Redeliver the same call id (at-least-once delivery from the platform).
    manager.handleEvent('s-test', call);
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));

    const state = fx.store.get('s-test');
    expect(state?.concepts['es-copula'].correctCount).toBe(1);
    expect(sender.ofType('response.item.create')).toHaveLength(1);
  });

  it('returns structured errors for unknown tools without crashing', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx);
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent('s-test', outputItemDone('dlg_1', 'call_x', 'delete_everything', {}));
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));
    const payload = JSON.parse(
      (sender.ofType('response.item.create')[0].item as { output: string }).output,
    );
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('unknown_tool');
    expect(sender.ofType('response.create')).toHaveLength(1);
  });

  it('only executes complete batches: output_item.done alone does nothing', () => {
    const { sender, manager } = makeManager();
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent('s-test', outputItemDone('dlg_1', 'call_9', 'get_current_objective', {}));
    expect(sender.ofType('response.item.create')).toHaveLength(0);
    expect(sender.ofType('response.create')).toHaveLength(0);
  });

  it('a guardrail block stops write tools but allows reads', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx);
    manager.setToolBlock('s-test', true);
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent(
      's-test',
      outputItemDone('dlg_1', 'call_b1', 'assess_understanding', {
        conceptId: 'es-copula',
        evidence: { kind: 'correct' },
      }),
    );
    manager.handleEvent(
      's-test',
      outputItemDone('dlg_1', 'call_b2', 'get_current_objective', {}),
    );
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));

    const payloads = sender
      .ofType('response.item.create')
      .map((c) => JSON.parse((c.item as { output: string }).output));
    expect(payloads[0].ok).toBe(false);
    expect(payloads[0].error.code).toBe('blocked');
    expect(payloads[1].ok).toBe(true); // reads still work
    manager.setToolBlock('s-test', false);
    expect(manager.isBlocked('s-test')).toBe(false);
  });

  it('handles malformed arguments without crashing', () => {
    const { fx, sender, manager } = makeManager();
    startCopula(fx);
    manager.handleEvent('s-test', delegationCreated('dlg_1'));
    manager.handleEvent('s-test', outputItemDone('dlg_1', 'call_m', 'assess_understanding', 'not-json{{{'));
    manager.handleEvent('s-test', nestedEvent('dlg_1', { type: 'response.completed' }));
    const payload = JSON.parse(
      (sender.ofType('response.item.create')[0].item as { output: string }).output,
    );
    expect(payload.ok).toBe(false);
  });
});
