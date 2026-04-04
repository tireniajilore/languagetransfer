const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const MODEL_ID = 'eleven_multilingual_v2';

interface TTSRequestBody {
  text?: string;
  lang?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: 'ELEVENLABS_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  let body: TTSRequestBody;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return Response.json({ error: 'The "text" field is required.' }, { status: 400 });
  }

  const elevenLabsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        ...(body.lang === 'es' ? {
          language_code: 'es',
          previous_text: 'En español:',
          next_text: 'Muy bien.'
        } : {})
      }),
      cache: 'no-store'
    }
  );

  if (!elevenLabsResponse.ok) {
    const errorText = await elevenLabsResponse.text();
    return Response.json(
      {
        error: 'ElevenLabs request failed.',
        details: errorText || 'Unknown ElevenLabs error.'
      },
      { status: elevenLabsResponse.status }
    );
  }

  const audioBuffer = await elevenLabsResponse.arrayBuffer();

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store'
    }
  });
}
