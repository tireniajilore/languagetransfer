import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../config';

describe('loadConfig', () => {
  it('requires OPENAI_API_KEY', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ OPENAI_API_KEY: '   ' })).toThrow(ConfigError);
  });

  it('applies sane defaults', () => {
    const cfg = loadConfig({ OPENAI_API_KEY: 'sk-test' });
    expect(cfg.port).toBe(8080);
    expect(cfg.allowedOrigins).toEqual([]);
    expect(cfg.liveModel).toBe('gpt-live-1');
    expect(cfg.sessionInstructions).toContain('Thinking Method');
    expect(cfg.rateLimit).toEqual({ windowMs: 60_000, max: 10 });
    expect(cfg.maxReconnectAttempts).toBe(5);
    expect(cfg.liveApiBaseUrl).toBe('https://api.openai.com');
  });

  it('parses ALLOWED_ORIGIN as a comma-separated list', () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: 'sk-test',
      ALLOWED_ORIGIN: 'https://a.example.com, https://b.example.com ',
    });
    expect(cfg.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('rejects invalid integers', () => {
    expect(() => loadConfig({ OPENAI_API_KEY: 'x', PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ OPENAI_API_KEY: 'x', RATE_LIMIT_MAX: '-1' })).toThrow(ConfigError);
  });

  it('accepts instruction and model overrides', () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: 'x',
      LIVE_MODEL: 'gpt-live-1',
      LIVE_SESSION_INSTRUCTIONS: 'custom',
    });
    expect(cfg.sessionInstructions).toBe('custom');
  });
});
