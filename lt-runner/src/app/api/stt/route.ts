export const runtime = 'nodejs';

const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';

// OpenAI keys transcription format off the filename extension, so it must match
// the actual audio container. Browsers differ: Chrome/Firefox record webm/opus,
// Safari records mp4/aac. Derive the extension from the blob's MIME type.
function fileNameForType(type: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/mpga': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav'
  };
  const base = type.split(';')[0].trim();
  return `answer.${map[base] ?? 'webm'}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  let inbound: FormData;
  try {
    inbound = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const file = inbound.get('file');
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: 'The "file" field (audio) is required.' }, { status: 400 });
  }

  const expected = (inbound.get('expected') as string | null)?.trim() ?? '';

  const form = new FormData();
  form.append('file', file, fileNameForType(file.type));
  form.append('model', TRANSCRIBE_MODEL);
  form.append('language', 'es');
  // Bias spelling toward the expected answer. The learner is drilling a known
  // target word, so naming it turns open-vocabulary transcription into a
  // near-match task and sharply improves accuracy on exactly the words we expect.
  if (expected) {
    form.append('prompt', `El estudiante intenta decir una de estas palabras en español: ${expected}.`);
  }

  const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: 'no-store'
  });

  if (!openaiResponse.ok) {
    const details = await openaiResponse.text();
    return Response.json(
      { error: 'Transcription failed.', details: details || 'Unknown OpenAI error.' },
      { status: 502 }
    );
  }

  const data = (await openaiResponse.json()) as { text?: string };
  return Response.json({ text: (data.text ?? '').trim() }, { headers: { 'Cache-Control': 'no-store' } });
}
