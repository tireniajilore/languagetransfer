import { describe, expect, it } from 'vitest';
import { SPANISH_CURRICULUM_V1 } from '../../curriculum/spanish';
import { HarnessObserver } from '../observer';
import { createHarnessState } from '../stateMachine';
import { HarnessStore } from '../tools';

const CUR = SPANISH_CURRICULUM_V1;

function setup() {
  const store = new HarnessStore();
  const observer = new HarnessObserver(store, CUR, () => 1_000);
  store.insert(createHarnessState({ sessionId: 's1', curriculum: CUR, now: 1_000 }));
  return { store, observer };
}

describe('HarnessObserver', () => {
  it('records a completed speaker turn as a neutral utterance observation', () => {
    const { store, observer } = setup();
    observer.onTranscriptDelta('s1', 'user', 'quiero ');
    observer.onTranscriptDelta('s1', 'user', 'cancelar');
    expect(store.get('s1')?.evidence).toHaveLength(0); // not flushed yet
    observer.onTranscriptDelta('s1', 'assistant', 'Bien.'); // speaker switch flushes
    const evidence = store.get('s1')?.evidence ?? [];
    expect(evidence).toHaveLength(1);
    expect(evidence[0].kind).toBe('utterance');
    expect(evidence[0].detail).toContain('user: quiero cancelar');
  });

  it('flushes buffered speech on session close and marks the session abandoned', () => {
    const { store, observer } = setup();
    observer.onTranscriptDelta('s1', 'user', 'hola');
    observer.onSessionClosed('s1');
    const evidence = store.get('s1')?.evidence ?? [];
    expect(evidence).toHaveLength(1);
    expect(store.get('s1')?.status).toBe('abandoned');
    expect(observer.bufferedSessions).toBe(0);
  });

  it('does not treat utterances as mastery evidence', () => {
    const { store, observer } = setup();
    for (let i = 0; i < 10; i++) {
      observer.onTranscriptDelta('s1', 'user', `word${i}`);
      observer.onTranscriptDelta('s1', 'assistant', 'ok');
    }
    observer.onSessionClosed('s1');
    const mastered = Object.values(store.get('s1')?.concepts ?? {}).filter(
      (c) => c.status === 'mastered',
    );
    expect(mastered).toHaveLength(0);
  });

  it('ignores sessions with no harness state', () => {
    const { observer } = setup();
    expect(() => observer.onTranscriptDelta('nope', 'user', 'hi')).not.toThrow();
    expect(() => observer.onSessionClosed('nope')).not.toThrow();
  });

  it('handles close with no buffered speech', () => {
    const { store, observer } = setup();
    observer.onSessionClosed('s1');
    expect(store.get('s1')?.evidence).toHaveLength(0);
    expect(store.get('s1')?.status).toBe('abandoned');
  });
});
