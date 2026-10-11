/**
 * Environment configuration for the live teaching backend.
 *
 * The OpenAI project API key is the only required secret. It must be supplied
 * as the OPENAI_API_KEY environment variable (Railway service variable in
 * staging/production). The browser never sees this key — the backend owns the
 * GPT-Live session lifecycle and the sideband connection.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface LiveBackendConfig {
  openaiApiKey: string;
  port: number;
  /** Comma-separated origin allowlist from ALLOWED_ORIGIN; empty = allow all (dev only, warns). */
  allowedOrigins: string[];
  rateLimit: RateLimitConfig;
  liveModel: string;
  /** Soft-control instructions attached to every GPT-Live session at creation. */
  sessionInstructions: string;
  maxReconnectAttempts: number;
  /** WebSocket sideband attach URL template. */
  liveApiBaseUrl: string;
  /**
   * Backend reasoning model for Responses delegation (Layer C).
   * Default gpt-5.6-terra; gpt-5.6-luna is the documented cost-sensitive alternative.
   */
  delegationModel: string;
  /** Set LIVE_DELEGATION_DISABLED=1 to mint sessions without delegation (tests/debug). */
  delegationDisabled: boolean;
  /**
   * Kill-switch for the live tutor (PR 5). LIVE_TUTOR_ENABLED=0 makes the
   * mint endpoint return 503; the /live frontend checks its own flag too.
   * Defaults to enabled.
   */
  liveTutorEnabled: boolean;
  /**
   * Postgres connection string for learner memory (Layer D). When unset, the
   * backend runs with the in-memory harness store and nothing is persisted.
   */
  databaseUrl?: string;
  /** HMAC secret for browser-held anonymous learner capabilities. */
  learnerTokenSecret?: string;
  /** Raw session data older than this (days) is purged; aggregates are kept. */
  memoryRetentionDays: number;
  /** Write-behind flush interval for the persistent store. */
  memoryFlushIntervalMs: number;
}

const DEFAULT_INSTRUCTIONS = [
  'You are a warm, patient Spanish teacher using the Language Transfer "Thinking Method".',
  'Build on what the learner already understands. Guide discovery with carefully chosen',
  'questions rather than delivering answers. Break complex ideas into small steps the learner',
  'can reason through themselves. Never give an answer prematurely: when the learner struggles,',
  'offer progressively more useful hints that preserve productive thinking. Correct misconceptions',
  'kindly, without shaming. Reinforce the reasoning process, not just correct answers.',
  'Teach in English with natural English pronunciation; use Spanish pronunciation only',
  'when modeling verified Spanish words or phrases, then return to English;',
  'use only verified Spanish examples you are confident about. If the learner asks to switch',
  'topics, answer briefly and return to the current learning objective.',
].join(' ');

function parseIntEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ConfigError(`${name} must be a positive integer (got "${raw}")`);
  }
  return n;
}

/** Load and validate config. Pass an explicit env record in tests to avoid process.env. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): LiveBackendConfig {
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey || openaiApiKey.trim() === '') {
    throw new ConfigError(
      'OPENAI_API_KEY is required (OpenAI project key with GPT-Live access). ' +
        'Set it as a Railway service variable; never commit it.',
    );
  }

  const allowedOrigins = (env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  const learnerTokenSecret = env.LEARNER_TOKEN_SECRET?.trim() || undefined;
  if (databaseUrl && (!learnerTokenSecret || learnerTokenSecret.length < 32)) {
    throw new ConfigError('LEARNER_TOKEN_SECRET (>=32 characters) is required with DATABASE_URL');
  }

  return {
    openaiApiKey,
    port: parseIntEnv(env, 'PORT', 8080),
    allowedOrigins,
    rateLimit: {
      windowMs: parseIntEnv(env, 'RATE_LIMIT_WINDOW_MS', 60_000),
      max: parseIntEnv(env, 'RATE_LIMIT_MAX', 10),
    },
    liveModel: env.LIVE_MODEL ?? 'gpt-live-1',
    sessionInstructions: env.LIVE_SESSION_INSTRUCTIONS ?? DEFAULT_INSTRUCTIONS,
    maxReconnectAttempts: parseIntEnv(env, 'SIDEBAND_MAX_RECONNECT_ATTEMPTS', 5),
    liveApiBaseUrl: env.OPENAI_API_BASE_URL ?? 'https://api.openai.com',
    delegationModel: env.LIVE_DELEGATION_MODEL ?? 'gpt-5.6-terra',
    delegationDisabled: env.LIVE_DELEGATION_DISABLED === '1',
    liveTutorEnabled: env.LIVE_TUTOR_ENABLED !== '0',
    databaseUrl,
    learnerTokenSecret,
    memoryRetentionDays: parseIntEnv(env, 'MEMORY_RETENTION_DAYS', 180),
    memoryFlushIntervalMs: parseIntEnv(env, 'MEMORY_FLUSH_INTERVAL_MS', 5000),
  };
}
