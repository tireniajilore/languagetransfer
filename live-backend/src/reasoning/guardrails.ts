/**
 * Guardrails on the sideband transcript stream (Layer C, evaluated control).
 *
 * ADR-001 D4: the sideband watches `session.input_transcript.delta` /
 * `session.output_transcript.delta` with a fast, deterministic checker for:
 *
 *  (a) answer leakage — the assistant speaks a target answer to the current
 *      question before a `reveal_answer` move was committed;
 *  (b) teaching ahead — the assistant introduces a concept the curriculum has
 *      not introduced yet (a "curriculum leak"; the PR #11 research found these
 *      happen regardless of prompting).
 *
 * On trigger the monitor logs the event with request/delegation ids and sends
 * an application-authored corrective `session.instructions.append` (which
 * interrupts speech). Word-for-word pre-playback gating is explicitly out of
 * scope (see ADR-001 D4); subtle unsupported claims beyond these two
 * deterministic checks are measured by the pedagogical evals, not blocked here.
 *
 * Both checks are deterministic string rules — no model in the loop, so the
 * guardrail itself can never add latency to the conversation.
 */

import { Curriculum } from '../curriculum/types';
import { HarnessStore } from '../harness/tools';

export type GuardrailKind = 'answer_leak' | 'teaching_ahead';

export interface GuardrailTrigger {
  kind: GuardrailKind;
  sessionId: string;
  delegationId?: string;
  /** Short excerpt of the offending speech (for logs, not echoed to the learner). */
  excerpt: string;
  detail: string;
  at: number;
}

export interface GuardrailDeps {
  store: HarnessStore;
  curriculum: Curriculum;
  /** Outbound command channel (sideband in production, fake in tests). */
  sendCommand?: (command: Record<string, unknown>) => void;
  onTrigger?: (trigger: GuardrailTrigger) => void;
  now?: () => number;
}

interface TurnBuffer {
  speaker: 'user' | 'assistant';
  text: string;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CORRECTIVE_INSTRUCTIONS: Record<GuardrailKind, string> = {
  answer_leak:
    'You just revealed the answer before the learner derived it. Do not give answers directly. ' +
    'Return to guided discovery: ask the questions that let the learner produce the answer themselves.',
  teaching_ahead:
    'You introduced material the learner has not reached yet. Return to the current learning ' +
    'objective and build only on concepts already introduced.',
};

let correctiveSeq = 0;

export class GuardrailMonitor {
  private readonly buffers = new Map<string, TurnBuffer>();
  private readonly triggers: GuardrailTrigger[] = [];
  /** sessionId -> conceptId -> target answers currently live (asked, not yet revealed). */
  private readonly liveTargets = new Map<string, Map<string, string[]>>();

  constructor(private readonly deps: GuardrailDeps) {}

  /** Register the expected answers for the question just asked (no-reveal-yet). */
  registerLiveTargets(sessionId: string, conceptId: string, targets: string[]): void {
    let perSession = this.liveTargets.get(sessionId);
    if (!perSession) {
      perSession = new Map();
      this.liveTargets.set(sessionId, perSession);
    }
    perSession.set(conceptId, targets);
  }

  /** Clear live targets once the learner has produced or the answer is revealed. */
  clearLiveTargets(sessionId: string, conceptId: string): void {
    this.liveTargets.get(sessionId)?.delete(conceptId);
  }

  /** Feed one transcript delta from the sideband (mirrors the observer's accumulation). */
  onTranscriptDelta(sessionId: string, speaker: 'user' | 'assistant', delta: string): void {
    const existing = this.buffers.get(sessionId);
    if (existing && existing.speaker !== speaker) {
      this.checkTurn(sessionId, existing);
    }
    const buf = this.buffers.get(sessionId) ?? { speaker, text: '' };
    buf.speaker = speaker;
    buf.text += delta;
    this.buffers.set(sessionId, buf);
  }

  /** Flush a completed turn (e.g. on session close) so it is still checked. */
  flush(sessionId: string): void {
    const buf = this.buffers.get(sessionId);
    if (buf) {
      this.buffers.delete(sessionId);
      this.checkTurn(sessionId, buf);
    }
  }

  getTriggers(sessionId?: string): GuardrailTrigger[] {
    return sessionId
      ? this.triggers.filter((t) => t.sessionId === sessionId)
      : [...this.triggers];
  }

  private checkTurn(sessionId: string, turn: TurnBuffer): void {
    if (turn.speaker !== 'assistant') return;
    const text = turn.text.trim();
    if (!text) return;
    this.checkAnswerLeak(sessionId, text);
    this.checkTeachingAhead(sessionId, text);
  }

  private checkAnswerLeak(sessionId: string, text: string): void {
    const state = this.deps.store.get(sessionId);
    if (!state) return;
    const perSession = this.liveTargets.get(sessionId);
    if (!perSession) return;
    const norm = ` ${normalize(text)} `;
    for (const [conceptId, targets] of perSession) {
      const revealed = state.moves.some(
        (m) => m.move.move === 'reveal_answer' && m.move.conceptId === conceptId,
      );
      if (revealed) continue;
      for (const target of targets) {
        const t = normalize(target);
        if (t.length > 1 && norm.includes(` ${t} `)) {
          this.trigger(sessionId, {
            kind: 'answer_leak',
            excerpt: text.slice(0, 160),
            detail: `assistant spoke target answer "${target}" for concept "${conceptId}" before any reveal_answer was committed`,
          });
          return;
        }
      }
    }
  }

  private checkTeachingAhead(sessionId: string, text: string): void {
    const state = this.deps.store.get(sessionId);
    if (!state) return;
    const norm = ` ${normalize(text)} `;
    const introduced = new Set(
      Object.entries(state.concepts)
        .filter(([, cs]) => cs.status === 'in_progress' || cs.status === 'struggling' || cs.status === 'mastered')
        .map(([id]) => id),
    );
    for (const concept of this.deps.curriculum.concepts) {
      if (introduced.has(concept.id)) continue;
      if (state.currentObjectiveId) {
        const objective = this.deps.curriculum.objectives.find((o) => o.id === state.currentObjectiveId);
        if (objective && !objective.conceptIds.includes(concept.id)) continue; // out of scope, not "ahead"
      }
      // A concept is "taught" when the assistant utters one of its verified
      // examples or its title keywords while it has not been introduced.
      const markers = [
        ...concept.verifiedExamples,
        ...concept.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3),
      ];
      for (const marker of markers) {
        const m = normalize(marker);
        if (m.length > 3 && norm.includes(` ${m} `)) {
          this.trigger(sessionId, {
            kind: 'teaching_ahead',
            excerpt: text.slice(0, 160),
            detail: `assistant introduced "${concept.id}" (marker "${marker}") before it was introduced`,
          });
          return;
        }
      }
    }
  }

  private trigger(sessionId: string, partial: { kind: GuardrailKind; excerpt: string; detail: string }): void {
    const now = this.deps.now ?? Date.now;
    const trigger: GuardrailTrigger = {
      sessionId,
      ...partial,
      at: now(),
    };
    this.triggers.push(trigger);
    this.deps.onTrigger?.(trigger);
    // Application-authored corrective instruction; interrupts speech in progress.
    correctiveSeq += 1;
    try {
      this.deps.sendCommand?.({
        type: 'session.instructions.append',
        event_id: `guardrail_${partial.kind}_${correctiveSeq}`,
        delegation_id: null,
        content: CORRECTIVE_INSTRUCTIONS[partial.kind],
      });
    } catch {
      // A failed steer must not break the session; the trigger is logged.
    }
  }
}
