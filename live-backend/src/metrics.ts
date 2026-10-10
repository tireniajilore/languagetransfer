/**
 * Latency instrumentation (PR 1 acceptance cares about measured latency, not
 * claims). In-memory ring buffers per label; exported for tests and future
 * /metrics. The PR 1 target from the brief is <1s end-of-speech → first audio
 * for routine responses — the browser side will report that in PR 5; here we
 * instrument what the backend owns (session creation, tool execution, sideband
 * round-trips).
 */
export interface LatencySample {
  label: string;
  ms: number;
  at: number;
}

export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  max: number;
}

const MAX_SAMPLES_PER_LABEL = 1_000;
const samples = new Map<string, LatencySample[]>();

export function recordLatency(label: string, ms: number): void {
  const list = samples.get(label) ?? [];
  list.push({ label, ms, at: Date.now() });
  if (list.length > MAX_SAMPLES_PER_LABEL) list.splice(0, list.length - MAX_SAMPLES_PER_LABEL);
  samples.set(label, list);
}

export function getLatencyStats(label: string): LatencyStats | null {
  const list = samples.get(label);
  if (!list || list.length === 0) return null;
  const sorted = [...list].map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    count: sorted.length,
    p50: pct(0.5),
    p95: pct(0.95),
    max: sorted[sorted.length - 1],
  };
}

/** Test-only reset. */
export function clearLatency(): void {
  samples.clear();
}
