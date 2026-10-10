#!/usr/bin/env tsx
/**
 * Automated evaluation report (PR 5, brief §11).
 *
 * Runs the eval suites hermetically (no OpenAI calls) and emits a Markdown
 * report plus machine-readable JSON:
 *   docs/evals/latest.md
 *   docs/evals/latest.json
 *
 * Suites covered:
 *   - src/reasoning/evals/scenarios.test.ts   (brief §11: 15 automated cases)
 *   - src/reasoning/evals/pedagogical.test.ts (simulated learners, real Spanish material)
 *   - src/reasoning/__tests__/guardrails.test.ts (deterministic guardrail checks)
 *
 * The report also records the latency/enforcement trade-off status from
 * ADR-001 D4 and is explicit about what is NOT verified (live latency,
 * real-learner outcomes).
 *
 * Usage: npm run eval:report
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '..', 'docs', 'evals');

interface AssertionResult {
  title: string;
  status: 'passed' | 'failed' | 'pending' | 'todo' | 'skipped';
  duration?: number;
}

interface FileResult {
  name: string;
  assertionResults: AssertionResult[];
}

interface VitestJson {
  testResults: FileResult[];
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
}

interface SuiteSummary {
  file: string;
  label: string;
  passed: number;
  failed: number;
  skipped: number;
  cases: Array<{ title: string; status: string }>;
}

const SUITES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /evals\/scenarios\.test\.ts$/, label: 'Teaching scenarios (brief §11, 15 automated cases)' },
  { pattern: /evals\/pedagogical\.test\.ts$/, label: 'Pedagogical evals (simulated learners, Spanish material)' },
  { pattern: /__tests__\/guardrails\.test\.ts$/, label: 'Guardrail deterministic checks (evaluated control)' },
];

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function runSuites(): VitestJson {
  const files = 'src/reasoning/evals/scenarios.test.ts src/reasoning/evals/pedagogical.test.ts src/reasoning/__tests__/guardrails.test.ts';
  const out = execSync(`npx vitest run --reporter=json ${files}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  // The JSON reporter prints one JSON object; vitest may prefix log lines.
  const start = out.indexOf('{');
  return JSON.parse(out.slice(start)) as VitestJson;
}

function summarize(json: VitestJson): SuiteSummary[] {
  return json.testResults.map((fr) => {
    const short = fr.name.split('live-backend/').pop() ?? fr.name;
    const label = SUITES.find((s) => s.pattern.test(fr.name))?.label ?? short;
    const cases = fr.assertionResults.map((a) => ({ title: a.title, status: a.status }));
    return {
      file: short,
      label,
      passed: cases.filter((c) => c.status === 'passed').length,
      failed: cases.filter((c) => c.status === 'failed').length,
      skipped: cases.filter((c) => !['passed', 'failed'].includes(c.status)).length,
      cases,
    };
  });
}

function renderMarkdown(suites: SuiteSummary[], sha: string, generatedAt: string): string {
  const totalPassed = suites.reduce((a, s) => a + s.passed, 0);
  const totalFailed = suites.reduce((a, s) => a + s.failed, 0);
  const total = totalPassed + totalFailed;
  const rate = total === 0 ? 0 : (100 * totalPassed) / total;

  const lines: string[] = [];
  lines.push('# Live Tutor Evaluation Report');
  lines.push('');
  lines.push(`Generated: ${generatedAt} · git: \`${sha}\` · hermetic (no OpenAI calls)`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| suite | passed | failed | pass rate |');
  lines.push('|-------|--------|--------|-----------|');
  for (const s of suites) {
    const n = s.passed + s.failed;
    const r = n === 0 ? 0 : (100 * s.passed) / n;
    lines.push(`| ${s.label} | ${s.passed} | ${s.failed} | ${r.toFixed(1)}% |`);
  }
  lines.push(`| **total** | **${totalPassed}** | **${totalFailed}** | **${rate.toFixed(1)}%** |`);
  lines.push('');
  for (const s of suites) {
    lines.push(`## ${s.label}`);
    lines.push('');
    lines.push(`File: \`${s.file}\``);
    lines.push('');
    for (const c of s.cases) {
      const mark = c.status === 'passed' ? '✅' : c.status === 'failed' ? '❌' : '⏭️';
      lines.push(`- ${mark} ${c.title}`);
    }
    lines.push('');
  }
  lines.push('## Latency / enforcement trade-off status (ADR-001 D4)');
  lines.push('');
  lines.push('- **Hard controls** (enforced in code): objective gating, prerequisite locking,');
  lines.push('  transition validation, idempotent tool commits — covered by state-machine and');
  lines.push('  tool-contract tests above. Enforced, not prompted.');
  lines.push('- **Soft controls** (model instructions): teaching tone, guided-discovery');
  lines.push('  preference, no premature answers — delivered via `session.instructions` and');
  lines.push('  `session.thinking` context. Prompted, not enforced.');
  lines.push('- **Evaluated controls** (measured): the guardrail suite above checks answer');
  lines.push('  leakage and teaching-ahead deterministically on the transcript stream;');
  lines.push('  pedagogical quality beyond that is measured by the simulated-learner suites.');
  lines.push('- **Explicitly NOT implemented**: word-for-word pre-playback gating of spoken');
  lines.push('  audio. Revisit only if offline evals show unacceptable leakage — see ADR-001');
  lines.push('  D4 for the trigger condition and the documented fallback.');
  lines.push('');
  lines.push('## Latency');
  lines.push('');
  lines.push('- Scripted (mocked boundaries): `npm run bench` — backend-owned paths');
  lines.push('  (analysis, tool dispatch, delegation overhead).');
  lines.push('- Live speech-end → first-audio: **not yet measured** — requires a real');
  lines.push('  browser voice session. Follow `docs/plans/live-latency-procedure.md`.');
  lines.push('  Target: <1s for routine responses (brief §9).');
  lines.push('');
  lines.push('## Honest limitations of this report');
  lines.push('');
  lines.push('- Learners are simulated, not real. Persona coverage is only as good as the');
  lines.push('  dataset; emergent real-learner behavior is out of scope here.');
  lines.push('- No live end-to-end verification: nothing here proves the voice loop works');
  lines.push('  against real GPT-Live sessions.');
  lines.push('- Guardrail checks are deterministic string rules; subtle unsupported claims');
  lines.push('  beyond answer-leak/teaching-ahead are measured by the pedagogical suite,');
  lines.push('  not blocked.');
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const generatedAt = new Date().toISOString();
  const sha = gitSha();
  console.log('Running eval suites (hermetic)...');
  const json = runSuites();
  const suites = summarize(json);
  const totalFailed = suites.reduce((a, s) => a + s.failed, 0);
  for (const s of suites) {
    console.log(`  ${s.label}: ${s.passed} passed, ${s.failed} failed`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const md = renderMarkdown(suites, sha, generatedAt);
  writeFileSync(join(OUT_DIR, 'latest.md'), md);
  writeFileSync(
    join(OUT_DIR, 'latest.json'),
    JSON.stringify({ generatedAt, sha, suites }, null, 2),
  );
  console.log(`\nWrote docs/evals/latest.md and docs/evals/latest.json`);
  if (totalFailed > 0) {
    console.error(`${totalFailed} eval case(s) failing — see the report.`);
    process.exitCode = 1;
  }
}

main();
