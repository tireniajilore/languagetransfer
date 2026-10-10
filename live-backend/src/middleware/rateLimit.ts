/**
 * Minimal in-memory sliding-window rate limiter (per key, default = client IP).
 *
 * Used on the session-mint endpoint only: creating a Live session bills a 15s
 * voice-duration init credit on the project key, so we cap how fast one
 * caller can mint sessions. Not a distributed limiter — one Railway instance
 * is the PR 1 deployment shape (ADR-001 D1).
 */
import { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyFor?: (req: Request) => string;
}

export function rateLimit(opts: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  const keyFor = opts.keyFor ?? ((req) => req.ip ?? 'unknown');

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyFor(req);
    const windowStart = now - opts.windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= opts.max) {
      const oldest = recent[0];
      const retryAfterMs = Math.max(0, oldest + opts.windowMs - now);
      res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
      res.status(429).json({ error: 'rate_limited', retry_after_ms: retryAfterMs });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
