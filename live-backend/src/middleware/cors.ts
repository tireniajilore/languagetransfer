/**
 * CORS preflight handling for the live teaching backend.
 *
 * The browser frontend mints sessions with `fetch(url, { method: 'POST',
 * headers: { 'content-type': 'application/json' } })`. Cross-origin, that
 * triggers a CORS preflight (OPTIONS) before the POST. Without a preflight
 * handler Express answers 404, the browser blocks the request, and the UI
 * reports "Failed to fetch" — even though the backend is healthy and the
 * origin would be allowed.
 *
 * This middleware answers preflights for /api/* and stamps
 * Access-Control-Allow-Origin on real responses, using the same allowlist
 * semantics as originCheck: requests with no Origin pass (curl,
 * server-to-server); an empty allowlist passes with a warning (dev mode);
 * a non-listed Origin is rejected with 403.
 */
import { NextFunction, Request, Response } from 'express';

export function corsPreflight(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    const allowed =
      allowedOrigins.length === 0 || allowedOrigins.includes(origin);
    if (!allowed) {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    }
    next();
  };
}
