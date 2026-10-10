import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { originCheck } from '../middleware/originCheck';
import { corsPreflight } from '../middleware/cors';
import { rateLimit } from '../middleware/rateLimit';

function mockRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
    end() {
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; headers: Record<string, string> };
}

function reqWith(origin: string | undefined, ip = '1.2.3.4'): Request {
  return {
    get: (h: string) => (h === 'origin' ? origin : undefined),
    ip,
  } as unknown as Request;
}

const next: NextFunction = () => undefined;

describe('originCheck', () => {
  it('allows listed origins', () => {
    const res = mockRes();
    let called = false;
    originCheck(['https://app.example.com'])(reqWith('https://app.example.com'), res, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('rejects unlisted origins with 403', () => {
    const res = mockRes();
    originCheck(['https://app.example.com'])(reqWith('https://evil.example.com'), res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'origin_not_allowed' });
  });

  it('passes requests with no Origin header (non-browser callers)', () => {
    const res = mockRes();
    let called = false;
    originCheck(['https://app.example.com'])(reqWith(undefined), res, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('warns and allows everything when unconfigured (dev mode)', () => {
    const res = mockRes();
    let called = false;
    originCheck([])(reqWith('https://anything.example.com'), res, () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

describe('rateLimit', () => {
  it('allows up to max requests per window, then 429s', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = mockRes();
      limiter(reqWith(undefined), res, next);
      statuses.push(res.statusCode || 200);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it('429 responses carry Retry-After', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    limiter(reqWith(undefined), mockRes(), next);
    const res = mockRes();
    limiter(reqWith(undefined), res, next);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(res.body).toMatchObject({ error: 'rate_limited' });
  });

  it('limits per key independently', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    limiter(reqWith(undefined, '1.1.1.1'), mockRes(), next);
    const res = mockRes();
    let called = false;
    limiter(reqWith(undefined, '2.2.2.2'), res, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('does not call next on rejection', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const nextFn = vi.fn();
    limiter(reqWith(undefined), mockRes(), nextFn);
    limiter(reqWith(undefined), mockRes(), nextFn);
    expect(nextFn).toHaveBeenCalledTimes(1);
  });
});

describe('corsPreflight', () => {
  function preflightReq(origin: string | undefined, method: string): Request {
    return {
      get: (h: string) => (h === 'origin' ? origin : undefined),
      method,
      ip: '1.2.3.4',
    } as unknown as Request;
  }

  it('answers OPTIONS from a listed origin with 204 and CORS headers', () => {
    const res = mockRes();
    let called = false;
    corsPreflight(['https://app.example.com'])(
      preflightReq('https://app.example.com', 'OPTIONS'),
      res,
      () => {
        called = true;
      },
    );
    expect(called).toBe(false);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('content-type');
  });

  it('stamps Allow-Origin on real requests from a listed origin and passes through', () => {
    const res = mockRes();
    let called = false;
    corsPreflight(['https://app.example.com'])(
      preflightReq('https://app.example.com', 'POST'),
      res,
      () => {
        called = true;
      },
    );
    expect(called).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('rejects preflights from unlisted origins with 403', () => {
    const res = mockRes();
    corsPreflight(['https://app.example.com'])(
      preflightReq('https://evil.example.com', 'OPTIONS'),
      res,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'origin_not_allowed' });
  });

  it('passes requests with no Origin header untouched', () => {
    const res = mockRes();
    let called = false;
    corsPreflight(['https://app.example.com'])(preflightReq(undefined, 'OPTIONS'), res, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('allows everything when the allowlist is empty (dev mode)', () => {
    const res = mockRes();
    corsPreflight([])(preflightReq('https://anything.example.com', 'OPTIONS'), res, next);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://anything.example.com');
  });
});
