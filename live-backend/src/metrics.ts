/**
 * Latency instrumentation (PR 1 acceptance cares about measured latency, not
 * claims). In-memory ring buffers per label; exported for tests and the
 * /metrics endpoint (PR 5). The PR 1 target from the brief is <1s end-of-speech
 * → first audio for routine responses — the browser side reports that via the
 * live-latency procedure (docs/plans/live-latency-procedure.md); here we
 * instrument what the backend owns (session creation, tool execution,
 * delegation round-trips) plus counters for guardrail triggers, teaching
 * moves, delegation lifecycle, and session health.
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

const startedAt = Date.now();

/**
 * Monotonic counters, optionally split by a sub-label
 * (e.g. recordCounter('guardrail.triggered', 'answer_leak')).
 * In-memory; reset on process restart. For persistent aggregates see the
 * memory layer (PR 4).
 */
const counters = new Map<string, Map<string, number>>();

export function recordCounter(name: string, sub?: string): void {
  const label = sub ?? '';
  let inner = counters.get(name);
  if (!inner) {
    inner = new Map<string, number>();
    counters.set(name, inner);
  }
  inner.set(label, (inner.get(label) ?? 0) + 1);
}

/** Test-only reset. */
export function clearCounters(): void {
  counters.clear();
}

export interface MetricsSummary {
  uptime_ms: number;
  latency: Record<string, LatencyStats>;
  counters: Record<string, number | Record<string, number>>;
}

/** JSON-serializable snapshot for the /metrics endpoint. */
export function summarizeMetrics(): MetricsSummary {
  const latency: Record<string, LatencyStats> = {};
  for (const label of samples.keys()) {
    const stats = getLatencyStats(label);
    if (stats) latency[label] = stats;
  }
  const counterOut: Record<string, number | Record<string, number>> = {};
  for (const [name, inner] of counters) {
    if (inner.size === 1 && inner.has('')) {
      counterOut[name] = inner.get('') ?? 0;
    } else {
      const bySub: Record<string, number> = {};
      for (const [sub, n] of inner) bySub[sub === '' ? '(none)' : sub] = n;
      counterOut[name] = bySub;
    }
  }
  return { uptime_ms: Date.now() - startedAt, latency, counters: counterOut };
}
