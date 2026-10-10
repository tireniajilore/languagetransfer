import { describe, expect, it } from 'vitest';
import {
  clearCounters,
  clearLatency,
  getLatencyStats,
  recordCounter,
  recordLatency,
  summarizeMetrics,
} from '../metrics';

describe('metrics', () => {
  it('records samples and computes percentiles', () => {
    clearLatency();
    for (let i = 1; i <= 100; i++) recordLatency('op', i);
    const stats = getLatencyStats('op');
    expect(stats).not.toBeNull();
    expect(stats?.count).toBe(100);
    expect(stats?.p50).toBe(51);
    expect(stats?.p95).toBe(96);
    expect(stats?.max).toBe(100);
  });

  it('returns null for unknown labels', () => {
    clearLatency();
    expect(getLatencyStats('missing')).toBeNull();
  });

  it('caps stored samples', () => {
    clearLatency();
    for (let i = 0; i < 1_050; i++) recordLatency('op', i);
    expect(getLatencyStats('op')?.count).toBe(1_000);
  });

  it('counts events with and without sub-labels', () => {
    clearCounters();
    recordCounter('sessions.created');
    recordCounter('sessions.created');
    recordCounter('guardrail.triggered', 'answer_leak');
    recordCounter('guardrail.triggered', 'teaching_ahead');
    recordCounter('guardrail.triggered', 'answer_leak');
    const summary = summarizeMetrics();
    expect(summary.counters['sessions.created']).toBe(2);
    expect(summary.counters['guardrail.triggered']).toEqual({
      answer_leak: 2,
      teaching_ahead: 1,
    });
  });

  it('summarizeMetrics exposes uptime and latency stats as JSON', () => {
    clearLatency();
    clearCounters();
    recordLatency('tools.exec_ms', 12);
    recordCounter('teaching.move', 'give_hint');
    const summary = summarizeMetrics();
    expect(summary.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(summary.latency['tools.exec_ms']?.count).toBe(1);
    expect(summary.latency['tools.exec_ms']?.p50).toBe(12);
    expect(summary.counters['teaching.move']).toEqual({ give_hint: 1 });
    // JSON-serializable
    expect(() => JSON.stringify(summary)).not.toThrow();
  });
});
