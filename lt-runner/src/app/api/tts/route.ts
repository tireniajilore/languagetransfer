import {
  buildElevenLabsRequestBody,
  getElevenLabsVoiceId
} from '@/lib/elevenlabs-config';

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
    `https://api.elevenlabs.io/v1/text-to-speech/${getElevenLabsVoiceId()}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify(buildElevenLabsRequestBody(text, body.lang === 'es' ? 'es' : 'en')),
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
