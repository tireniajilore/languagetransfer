/**
 * GuardrailMonitor tests: answer-leak and teaching-ahead detection on
 * transcript deltas, corrective steering commands, and logging.
 */
import { describe, expect, it } from 'vitest';
import { GuardrailMonitor, GuardrailTrigger } from '../guardrails';
import { CUR, FakeSender, makeHarness, startCopula } from './helpers';

function makeMonitor(sessionId = 's-guard') {
  const fx = makeHarness(sessionId);
  startCopula(fx);
  const sender = new FakeSender();
  const triggers: GuardrailTrigger[] = [];
  const monitor = new GuardrailMonitor({
    store: fx.store,
    curriculum: CUR,
    sendCommand: (c) => sender.sendCommand(c),
    onTrigger: (t) => triggers.push(t),
    now: () => 5_000,
  });
  return { fx, sender, triggers, monitor };
}

/** Feed a complete assistant turn through delta accumulation. */
function assistantSays(
  monitor: GuardrailMonitor,
  sessionId: string,
  text: string,
): void {
  monitor.onTranscriptDelta(sessionId, 'assistant', text.slice(0, Math.ceil(text.length / 2)));
  monitor.onTranscriptDelta(sessionId, 'assistant', text.slice(Math.ceil(text.length / 2)));
  monitor.onTranscriptDelta(sessionId, 'user', 'ok');
}

describe('GuardrailMonitor', () => {
  it('triggers on an answer leak and sends a corrective instruction', () => {
    const { sender, triggers, monitor } = makeMonitor();
    monitor.registerLiveTargets('s-guard', 'es-copula', ['es']);
    assistantSays(monitor, 's-guard', 'The answer is es, just say es.');

    expect(triggers).toHaveLength(1);
    expect(triggers[0].kind).toBe('answer_leak');
    expect(triggers[0].sessionId).toBe('s-guard');
    expect(triggers[0].at).toBe(5_000);

    const appends = sender.ofType('session.instructions.append');
    expect(appends).toHaveLength(1);
    expect(appends[0].delegation_id).toBeNull();
    expect(String(appends[0].content)).toContain('Do not give answers directly');
  });

  it('does not trigger once the answer has been legitimately revealed', () => {
    const { fx, triggers, monitor } = makeMonitor();
    // A reveal is only valid after recorded struggle (hard control).
    fx.router.dispatch({
      sessionId: 's-guard',
      tool: 'assess_understanding',
      input: { turnId: 1, conceptId: 'es-copula', evidence: { kind: 'incorrect', detail: 'wrong guess' } },
    });
    const revealed = fx.router.dispatch({
      sessionId: 's-guard',
      tool: 'commit_teaching_decision',
      input: {
        turnId: 2,
        move: { move: 'reveal_answer', conceptId: 'es-copula', justification: 'productive struggle exhausted' },
      },
    });
    expect(revealed.ok).toBe(true);
    monitor.registerLiveTargets('s-guard', 'es-copula', ['es']);
    assistantSays(monitor, 's-guard', 'So the answer is es.');
    expect(triggers).toHaveLength(0);
  });

  it('does not trigger on ordinary teaching speech', () => {
    const { triggers, monitor } = makeMonitor();
    monitor.registerLiveTargets('s-guard', 'es-copula', ['es']);
    assistantSays(monitor, 's-guard', 'Listen to the ending. What does the -o tell us?');
    expect(triggers).toHaveLength(0);
  });

  it('triggers when the assistant teaches an unintroduced concept', () => {
    const { triggers, monitor } = makeMonitor();
    // es-quiero-want belongs to the NEXT objective; teaching it now is ahead.
    assistantSays(
      monitor,
      's-guard',
      'Now, quiero means I want. Say quiero.',
    );
    const ahead = triggers.filter((t) => t.kind === 'teaching_ahead');
    expect(ahead).toHaveLength(1);
    expect(ahead[0].detail).toContain('es-quiero-want');
  });

  it('does not flag the concept currently being taught', () => {
    const { triggers, monitor } = makeMonitor();
    assistantSays(monitor, 's-guard', 'In Spanish we just say es. The word es is enough.');
    expect(triggers.filter((t) => t.kind === 'teaching_ahead')).toHaveLength(0);
  });

  it('ignores user turns', () => {
    const { triggers, monitor } = makeMonitor();
    monitor.registerLiveTargets('s-guard', 'es-copula', ['es']);
    monitor.onTranscriptDelta('s-guard', 'user', 'es');
    monitor.flush('s-guard');
    expect(triggers).toHaveLength(0);
  });

  it('flush checks a buffered turn on session close', () => {
    const { triggers, monitor } = makeMonitor();
    monitor.registerLiveTargets('s-guard', 'es-copula', ['es']);
    monitor.onTranscriptDelta('s-guard', 'assistant', 'The answer is es.');
    expect(triggers).toHaveLength(0); // not checked until the turn completes
    monitor.flush('s-guard');
    expect(triggers).toHaveLength(1);
  });

  it('clearLiveTargets stops leak detection for that concept', () => {
    const { triggers, monitor } = makeMonitor();
    monitor.registerLiveTargets('s-guard', 'es-copula', ['es']);
    monitor.clearLiveTargets('s-guard', 'es-copula');
    assistantSays(monitor, 's-guard', 'The answer is es.');
    expect(triggers.filter((t) => t.kind === 'answer_leak')).toHaveLength(0);
  });
});
