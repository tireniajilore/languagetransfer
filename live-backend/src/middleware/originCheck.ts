/**
 * Origin checking for the session-mint endpoint.
 *
 * The browser never talks to OpenAI, but we still only mint Live sessions for
 * our own frontends: a stolen backend URL would otherwise let anyone burn
 * voice-duration credits on Tireni's key. When ALLOWED_ORIGIN is configured,
 * requests carrying a non-listed Origin are rejected with 403. Requests with
 * no Origin header (curl, server-to-server) pass — this is a CSRF-style
 * check, not authentication.
 */
import { NextFunction, Request, Response } from 'express';

export function originCheck(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    if (allowedOrigins.length === 0) {
      console.warn(
        '[origin-check] ALLOWED_ORIGIN not configured; allowing all origins (dev mode)',
      );
      next();
      return;
    }
    if (allowedOrigins.includes(origin)) {
      next();
      return;
    }
    res.status(403).json({ error: 'origin_not_allowed' });
  };
}
