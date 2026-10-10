import { describe, expect, it } from 'vitest';
import { clearLatency, getLatencyStats, recordLatency } from '../metrics';

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
});
