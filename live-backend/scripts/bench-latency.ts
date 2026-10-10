#!/usr/bin/env tsx
/**
 * Scripted latency benchmark (PR 5).
 *
 * Measures the backend-owned portion of the conversational latency budget
 * against mocked boundaries — no OpenAI calls, no network. This covers what
 * the backend can measure by itself:
 *
 *   analysis.dispatch_ms    transcript-completed → analyzeResponse → suggested moves
 *   tools.exec_ms           ToolRouter.dispatch for a read-only tool
 *   delegation.overhead_ms  delegation.created → nested response.completed → batch executed
 *
 * It does NOT measure speech-end → first-audio: that spans the Live model and
 * the browser, and must be measured live. See
 * docs/plans/live-latency-procedure.md for the human-runnable procedure.
 *
 * Usage: npm run bench [-- <iterations>] [--json]
 */
import { SPANISH_CURRICULUM_V1 } from '../src/curriculum/spanish';
import { createHarnessState } from '../src/harness/stateMachine';
import { HarnessStore, ToolRouter } from '../src/harness/tools';
import { analyzeResponse } from '../src/reasoning/analysis';
import { DelegationManager } from '../src/reasoning/delegation';

const CUR = SPANISH_CURRICULUM_V1;

interface Stats {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

function summarize(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { count: sorted.length, mean, p50: pct(0.5), p95: pct(0.95), max: sorted[sorted.length - 1] };
}

function bench(label: string, iterations: number, fn: (i: number) => void): [string, Stats] {
  // Warmup: JIT + caches.
  for (let i = 0; i < Math.min(20, iterations); i++) fn(i);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn(i);
    samples.push(performance.now() - start);
  }
  return [label, summarize(samples)];
}

function main(): void {
  const args = process.argv.slice(2);
  const iterations = Number(args.find((a) => /^\d+$/.test(a)) ?? '200');
  const asJson = args.includes('--json');

  const sessionId = 'bench-session';
  const store = new HarnessStore();
  const router = new ToolRouter(
    { store, curriculum: CUR, now: () => Date.now() },
    () => undefined,
  );
  const objectiveId = CUR.objectives[0].id;
  store.insert(createHarnessState({ sessionId, curriculum: CUR, now: Date.now(), objectiveId }));
  // Start teaching the copula concept so analysis has a live target.
  const committed = router.dispatch({
    sessionId,
    tool: 'commit_teaching_decision',
    input: { turnId: 1, move: { move: 'introduce_concept', conceptId: 'es-copula' } },
  });
  if (!committed.ok) throw new Error('bench setup failed: could not introduce es-copula');

  const utterances = [
    'es',
    'eso',
    'eh, es?',
    'quiero cancelar',
    'umm I think es',
    'no sé',
    'la respuesta es es',
  ];

  const results: Array<[string, Stats]> = [];

  results.push(
    bench('analysis.dispatch_ms', iterations, (i) => {
      const state = store.get(sessionId);
      if (!state) throw new Error('no state');
      analyzeResponse({
        curriculum: CUR,
        state,
        utterance: utterances[i % utterances.length],
        conceptId: 'es-copula',
        expectedAnswers: ['es'],
      });
    }),
  );

  results.push(
    bench('tools.exec_ms', iterations, () => {
      router.dispatch({ sessionId, tool: 'get_teaching_options', input: {} });
    }),
  );

  const sender = {
    commands: [] as Array<Record<string, unknown>>,
    sendCommand(command: Record<string, unknown>): void {
      this.commands.push(command);
    },
  };
  const manager = new DelegationManager({ router, store, sender, log: () => undefined });
  results.push(
    bench('delegation.overhead_ms', iterations, (i) => {
      const dlg = `bench-dlg-${i}`;
      manager.handleEvent(sessionId, { type: 'delegation.created', delegation_id: dlg });
      manager.handleEvent(sessionId, {
        type: 'response.event',
        delegation_id: dlg,
        event: {
          type: 'response.output_item.done',
          item: {
            type: 'function_call',
            call_id: `bench-call-${i}`,
            name: 'get_current_objective',
            arguments: '{}',
          },
        },
      });
      manager.handleEvent(sessionId, {
        type: 'response.event',
        delegation_id: dlg,
        event: { type: 'response.completed' },
      });
    }),
  );

  if (asJson) {
    console.log(JSON.stringify(Object.fromEntries(results), null, 2));
    return;
  }
  console.log('\nLive-tutor backend latency benchmark (mocked boundaries, no OpenAI)\n');
  console.log('label                   count      mean       p50       p95       max');
  console.log('─'.repeat(72));
  for (const [label, s] of results) {
    const row = (v: number) => `${v.toFixed(2).padStart(9)}ms`;
    console.log(
      `${label.padEnd(24)}${String(s.count).padStart(6)}${row(s.mean)}${row(s.p50)}${row(s.p95)}${row(s.max)}`,
    );
  }
  console.log(
    '\nNote: speech-end → first-audio is NOT measured here — it spans the Live model\n' +
      'and the browser. Follow docs/plans/live-latency-procedure.md for the live\n' +
      'measurement (target: <1s for routine responses, per the brief §9).\n',
  );
}

main();
