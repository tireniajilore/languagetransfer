interface AnalyticsRequestBody {
  event?: string;
  sessionId?: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

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
        session_id: body.sessionId,
        ...body.properties
      }
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    return Response.json(
      { error: 'Unable to send analytics event.', details: errorText || 'Unknown error.' },
      { status: 502 }
    );
  }

  return new Response(null, { status: 204 });
}
