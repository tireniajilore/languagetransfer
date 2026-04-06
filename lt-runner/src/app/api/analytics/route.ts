interface AnalyticsRequestBody {
  event?: string;
  sessionId?: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

// Temporary diagnostic — remove after confirming PostHog works
export async function GET() {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  return Response.json({
    hasKey: !!apiKey,
    keyLength: apiKey?.length,
    keyPrefix: apiKey ? apiKey.slice(0, 12) : null,
    keySuffix: apiKey ? apiKey.slice(-8) : null,
    hasQuotes: apiKey ? (apiKey.startsWith('"') || apiKey.startsWith("'")) : null,
    hasWhitespace: apiKey ? apiKey !== apiKey.trim() : null,
    host: process.env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
    envKeys: Object.keys(process.env).filter(k => k.toLowerCase().includes('posthog'))
  });
}

export async function POST(request: Request) {
  let body: AnalyticsRequestBody;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.event || !body.sessionId) {
    return Response.json({ error: 'event and sessionId are required.' }, { status: 400 });
  }

  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) {
    return new Response(null, { status: 204 });
  }

  const host = (process.env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST).replace(/\/$/, '');

  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey,
      event: body.event,
      distinct_id: body.sessionId,
      properties: {
        token: apiKey,
        distinct_id: body.sessionId,
        session_id: body.sessionId,
        ...body.properties
      }
    }),
    cache: 'no-store'
  });

  const responseText = await response.text();

  // Temporary: return full debug info instead of 204
  return Response.json({
    debug: true,
    posthogStatus: response.status,
    posthogResponse: responseText,
    sentEvent: body.event,
    sentDistinctId: body.sessionId,
    keyUsed: apiKey.slice(0, 8) + '...'
  });
}
