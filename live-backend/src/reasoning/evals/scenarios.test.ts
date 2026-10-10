/**
 * Teaching-scenario evaluations (brief §11): the 15 automated cases, run
 * hermetically against the harness + router + delegation manager with a mocked
 * OpenAI boundary. Each scenario asserts a pedagogical invariant, not an
 * implementation detail.
 */
import { describe, expect, it } from 'vitest';
import { analyzeResponse } from '../analysis';
import { DelegationManager } from '../delegation';
import { HarnessObserver } from '../../harness/observer';
import { recordEvidence } from '../../harness/stateMachine';
import { CUR, FakeSender, makeHarness, startCopula } from '../__tests__/helpers';

function analyze(fx: ReturnType<typeof makeHarness>, utterance: string, conceptId = 'es-copula', expected = ['es']) {
  const state = fx.store.get(fx.sessionId);
  if (!state) throw new Error('no state');
  return analyzeResponse({ curriculum: CUR, state, utterance, conceptId, expectedAnswers: expected });
}

describe('teaching scenarios', () => {
  it('1. correct with demonstrated understanding: transfer suggested, mastery not granted', () => {
    const fx = makeHarness('sc1');
    startCopula(fx);
    const r = analyze(fx, 'es');
    expect(r.evidenceKind).toBe('correct');
    const moves = r.suggestedMoves.map((m) => m.move.move);
    expect(moves).toContain('test_transfer');
    // One correct answer must not master the concept (needs 2 + transfer pass).
    const state = fx.store.get('sc1');
    expect(state?.concepts['es-copula'].status).not.toBe('mastered');
  });

  it('2. correct without demonstrated understanding: probe before advancing', () => {
    const fx = makeHarness('sc2');
    startCopula(fx);
    const r = analyze(fx, 'es');
    const moves = r.suggestedMoves.map((m) => m.move.move);
    expect(moves).toContain('probe_understanding');
    expect(moves).not.toContain('advance_objective');
  });

  it('3. plausible misconception: flagged with authored diagnosis on the fast path', () => {
    const fx = makeHarness('sc3');
    startCopula(fx);
    const r = analyze(fx, 'quiero a cancelar', 'es-quiero-infinitive', ['quiero cancelar']);
    expect(r.path).toBe('fast');
    expect(r.misconceptionId).toBe('m-quiero-to');
    expect(r.evidenceKind).toBe('incorrect');
  });

  it('4. unexpected incorrect: escalates to delegated reasoning', () => {
    const fx = makeHarness('sc4');
    startCopula(fx);
    const r = analyze(fx, 'eso');
    expect(r.path).toBe('reasoning');
    expect(r.delegationRequest).toBeDefined();
    expect(r.delegationRequest?.match.outcome).toBe('wrong');
  });

  it('5. unclear/mis-transcribed speech: silence, no correction, no moves', () => {
    const fx = makeHarness('sc5');
    startCopula(fx);
    const r = analyze(fx, 'hmm uh what was that');
    expect(r.match.outcome).toBe('unclear');
    expect(r.evidenceKind).toBe('utterance');
    expect(r.suggestedMoves).toEqual([]);
  });

  it('6. extended silence: no evidence fabricated from nothing', () => {
    const fx = makeHarness('sc6');
    startCopula(fx);
    const observer = new HarnessObserver(fx.store, CUR, () => 1_000);
    observer.onTranscriptDelta('sc6', 'user', '   ');
    observer.onSessionClosed('sc6');
    const state = fx.store.get('sc6');
    // Whitespace-only "speech" records nothing.
    expect(state?.evidence.filter((e) => e.kind !== 'utterance')).toHaveLength(0);
  });

  it('7. interruption mid-delegation: redelivered events are idempotent', () => {
    const fx = makeHarness('sc7');
    startCopula(fx);
    const sender = new FakeSender();
    const manager = new DelegationManager({ router: fx.router, store: fx.store, sender, log: () => undefined });
    const created = { type: 'delegation.created', delegation_id: 'dlg_i' };
    const call = {
      type: 'response.event',
      delegation_id: 'dlg_i',
      event: {
        type: 'response.output_item.done',
        item: { type: 'function_call', call_id: 'c1', name: 'get_current_objective', arguments: '{}' },
      },
    };
    const done = { type: 'response.event', delegation_id: 'dlg_i', event: { type: 'response.completed' } };
    for (const e of [created, call, done, call, done]) manager.handleEvent('sc7', e);
    // One execution despite the redelivery.
    expect(sender.ofType('response.item.create')).toHaveLength(1);
  });

  it('8. request for the answer: no premature reveal without justification', () => {
    const fx = makeHarness('sc8');
    startCopula(fx);
    // "just tell me" matches nothing -> unclear -> silence, not a reveal.
    const r = analyze(fx, 'just tell me the answer please');
    expect(r.suggestedMoves.map((m) => m.move.move)).not.toContain('reveal_answer');
    // And the harness rejects a reveal with no justification.
    const res = fx.router.dispatch({
      sessionId: 'sc8',
      tool: 'commit_teaching_decision',
      input: { turnId: 2, move: { move: 'reveal_answer', conceptId: 'es-copula' } },
    });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('invalid_input');
  });

  it('9. attempt to skip prerequisites: locked concept stays locked', () => {
    const fx = makeHarness('sc9');
    startCopula(fx);
    // es-quiero-infinitive requires es-quiero-want (not mastered) -> locked.
    const res = fx.router.dispatch({
      sessionId: 'sc9',
      tool: 'commit_teaching_decision',
      input: { turnId: 2, move: { move: 'introduce_concept', conceptId: 'es-quiero-infinitive' } },
    });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('invalid_move');
  });

  it('10. previously mastered concept: reinforce/transfer, never re-introduce', () => {
    const fx = makeHarness('sc10');
    startCopula(fx);
    let s = fx.store.get('sc10');
    if (!s) throw new Error('no state');
    // Master the copula: 2 correct + 1 transfer pass.
    s = recordEvidence(CUR, s, { turnId: 1, conceptId: 'es-copula', kind: 'correct' }, 1_000);
    s = recordEvidence(CUR, s, { turnId: 2, conceptId: 'es-copula', kind: 'correct' }, 1_000);
    s = recordEvidence(CUR, s, { turnId: 3, conceptId: 'es-copula', kind: 'transfer_pass' }, 1_000);
    fx.store.update('sc10', () => s);
    const updated = fx.store.get('sc10');
    expect(updated?.concepts['es-copula'].status).toBe('mastered');
    const res = fx.router.dispatch({
      sessionId: 'sc10',
      tool: 'get_teaching_options',
      input: { conceptId: 'es-copula' },
    });
    const moves = (res.result as { options: Array<{ move: { move: string } }> }).options.map((o) => o.move.move);
    expect(moves).not.toContain('introduce_concept');
  });

  it('11. repeated mistakes: struggling status and hint escalation', () => {
    const fx = makeHarness('sc11');
    startCopula(fx);
    for (let i = 1; i <= 3; i++) {
      fx.router.dispatch({
        sessionId: 'sc11',
        tool: 'assess_understanding',
        input: { turnId: i, conceptId: 'es-copula', evidence: { kind: 'incorrect', detail: `attempt ${i}` } },
      });
    }
    const state = fx.store.get('sc11');
    expect(state?.concepts['es-copula'].status).toBe('struggling');
    expect(state?.concepts['es-copula'].incorrectCount).toBe(3);
  });

  it('12. tool failure: structured error, session continues', () => {
    const fx = makeHarness('sc12');
    startCopula(fx);
    const res = fx.router.dispatch({
      sessionId: 'sc12',
      tool: 'assess_understanding',
      input: { turnId: 1, conceptId: 'no-such-concept', evidence: { kind: 'correct' } },
    });
    expect(res.ok).toBe(false);
    // The session is untouched and still usable.
    const ok = fx.router.dispatch({
      sessionId: 'sc12',
      tool: 'get_current_objective',
      input: {},
    });
    expect(ok.ok).toBe(true);
  });

  it('13. session interruption and recovery: buffered turn flushed, state marked', () => {
    const fx = makeHarness('sc13');
    startCopula(fx);
    const observer = new HarnessObserver(fx.store, CUR, () => 1_000);
    observer.onTranscriptDelta('sc13', 'user', 'quiero');
    observer.onSessionClosed('sc13');
    const state = fx.store.get('sc13');
    expect(state?.status).toBe('abandoned');
    expect(state?.evidence.some((e) => e.kind === 'utterance')).toBe(true);
  });

  it('14. duplicate and out-of-order events: evidence never double-counts', () => {
    const fx = makeHarness('sc14');
    startCopula(fx);
    const input = { turnId: 5, conceptId: 'es-copula', kind: 'correct' as const, seq: 1 };
    // Out of order first (turn 5 before turn 2 exists), then duplicates.
    for (const turnId of [5, 2, 5, 5]) {
      fx.router.dispatch({
        sessionId: 'sc14',
        tool: 'record_learning_evidence',
        input: { ...input, turnId },
      });
    }
    const state = fx.store.get('sc14');
    const correct = state?.evidence.filter((e) => e.kind === 'correct' && e.conceptId === 'es-copula');
    expect(correct).toHaveLength(2); // turns 5 and 2, each once
  });

  it('15. stale delegated decision: rejected, never applied', () => {
    const fx = makeHarness('sc15');
    startCopula(fx); // turn = 1
    const res = fx.router.dispatch({
      sessionId: 'sc15',
      tool: 'commit_teaching_decision',
      input: {
        turnId: 1, // stale: harness is already at turn 1, expects 2
        move: { move: 'ask_discovery_question', conceptId: 'es-copula' },
      },
    });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('stale_turn');
    expect(fx.store.get('sc15')?.turn).toBe(1);
  });
});
