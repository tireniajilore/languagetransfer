import type { DemandSubmissionRequest, NextLessonInterest } from '@/types/demand';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

type RateLimitStore = Map<string, number[]>;

function getRateLimitStore(): RateLimitStore {
  const globalWithStore = globalThis as typeof globalThis & {
    __voiceaiDemandRateLimit?: RateLimitStore;
  };

  if (!globalWithStore.__voiceaiDemandRateLimit) {
    globalWithStore.__voiceaiDemandRateLimit = new Map<string, number[]>();
  }

  return globalWithStore.__voiceaiDemandRateLimit;
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return request.headers.get('x-real-ip') || 'unknown';
}

function isValidInterest(value: string | undefined): value is NextLessonInterest {
  return value === 'yes' || value === 'maybe' || value === 'no';
}

function normalizePayload(body: DemandSubmissionRequest) {
  return {
    ...body,
    email: body.email?.trim() || undefined,
    feedbackText: body.feedbackText?.trim() || undefined
  };
}

export async function POST(request: Request) {
  let body: DemandSubmissionRequest;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const payload = normalizePayload(body);

  if (payload.honeypot) {
    return new Response(null, { status: 204 });
  }

  if (!payload.sessionId || !payload.lessonId) {
    return Response.json({ error: 'sessionId and lessonId are required.' }, { status: 400 });
  }

  if (!isValidInterest(payload.wantsNextLesson)) {
    return Response.json({ error: 'wantsNextLesson must be yes, maybe, or no.' }, { status: 400 });
  }

  if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) {
    return Response.json({ error: 'rating must be an integer between 1 and 5.' }, { status: 400 });
  }

  if ((payload.wantsNextLesson === 'yes' || payload.wantsNextLesson === 'maybe') && !payload.email) {
    return Response.json({ error: 'Email is required if the user wants the next lesson.' }, { status: 400 });
  }

  if (payload.email && !EMAIL_PATTERN.test(payload.email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const store = getRateLimitStore();
  const recentHits = (store.get(ip) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentHits.length >= RATE_LIMIT_MAX) {
    return Response.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
  }

  recentHits.push(now);
  store.set(ip, recentHits);

  const row = {
    session_id: payload.sessionId,
    lesson_id: payload.lessonId,
    completed_lesson: payload.completedLesson,
    completion_percent: payload.completionPercent,
    wants_next_lesson: payload.wantsNextLesson,
    email: payload.email ?? null,
    rating: payload.rating,
    feedback_text: payload.feedbackText ?? null,
    referrer: payload.referrer ?? null,
    utm_source: payload.utmSource ?? null,
    utm_medium: payload.utmMedium ?? null,
    utm_campaign: payload.utmCampaign ?? null,
    created_at: new Date().toISOString()
  };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('Demand submission (Supabase not configured):', row);
      return Response.json({ ok: true, stored: false }, { status: 200 });
    }

    return Response.json(
      { error: 'Demand capture is not configured on the server.' },
      { status: 503 }
    );
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/demand_submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row),
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    return Response.json(
      { error: 'Unable to save demand submission.', details: errorText || 'Unknown error.' },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, stored: true }, { status: 200 });
}
