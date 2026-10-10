/**
 * Sideband observation feed (PR 2 scope: deterministic only).
 *
 * Accumulates `session.input_transcript.delta` / `session.output_transcript.delta`
 * fragments per speaker and records each completed speaker turn as a neutral
 * `utterance` observation via the harness. No inference happens here — the
 * deep pedagogical reasoning (classifying answers, diagnosing misconceptions)
 * lands in PR 3. A turn is considered complete when the speaker switches or
 * when the session closes; both are deterministic boundaries.
 *
 * Dedupe: each utterance carries a per-session sequence number in `seq`, so
 * re-delivered deltas can never double-record.
 */

import { Curriculum } from '../curriculum/types';
import { recordEvidence } from './stateMachine';
import { HarnessStore } from './tools';

interface UtteranceBuffer {
  speaker: 'user' | 'assistant';
  text: string;
}

export class HarnessObserver {
  private readonly buffers = new Map<string, UtteranceBuffer>();
  private readonly seqs = new Map<string, number>();

  constructor(
    private readonly store: HarnessStore,
    private readonly curriculum: Curriculum,
    private readonly now: () => number = Date.now,
  ) {}

  /** Feed one transcript delta from the sideband. */
  onTranscriptDelta(
    sessionId: string,
    speaker: 'user' | 'assistant',
    delta: string,
  ): void {
    if (!this.store.get(sessionId)) return; // harness not initialized for this session
    const existing = this.buffers.get(sessionId);
    if (existing && existing.speaker !== speaker) {
      this.flush(sessionId, existing);
    }
    const buf = this.buffers.get(sessionId) ?? { speaker, text: '' };
    buf.speaker = speaker;
    buf.text += delta;
    this.buffers.set(sessionId, buf);
  }

  /** Flush any buffered turn and mark the session abandoned in the harness. */
  onSessionClosed(sessionId: string): void {
    const buf = this.buffers.get(sessionId);
    if (buf) this.flush(sessionId, buf);
    this.buffers.delete(sessionId);
    this.seqs.delete(sessionId);
    try {
      this.store.update(sessionId, (s) => {
        if (s.status === 'completed' || s.status === 'abandoned') return s;
        return { ...s, status: 'abandoned' as const, updatedAt: this.now() };
      });
    } catch {
      // No harness state for this session — nothing to abandon.
    }
  }

  private flush(sessionId: string, buf: UtteranceBuffer): void {
    this.buffers.delete(sessionId);
    const text = buf.text.trim();
    if (!text) return;
    const seq = (this.seqs.get(sessionId) ?? 0) + 1;
    this.seqs.set(sessionId, seq);
    try {
      let turnId = 0;
      this.store.update(sessionId, (s) => {
        turnId = s.turn;
        return recordEvidence(
          this.curriculum,
          s,
          {
            turnId: s.turn,
            kind: 'utterance',
            detail: `${buf.speaker}: ${text.slice(0, 500)}`,
            seq,
          },
          this.now(),
        );
      });
      // Durable transcript archive (text only, never audio). The persistent
      // store writes the utterances table; the in-memory store ignores this.
      this.store.recordUtterance({
        sessionId,
        speaker: buf.speaker,
        text: text.slice(0, 2000),
        turnId,
        seq,
      });
    } catch {
      // Session state vanished mid-flush; drop the observation.
    }
  }

  /** For tests: number of sessions with buffered (unflushed) speech. */
  get bufferedSessions(): number {
    return this.buffers.size;
  }
}
