import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface ManifestRouteContext {
  params: {
    lessonId: string;
  };
}

export async function GET(_request: Request, { params }: ManifestRouteContext) {
  const manifestPath = path.join(process.cwd(), 'public', 'audio', params.lessonId, 'manifest.json');

  try {
    const manifest = await readFile(manifestPath, 'utf8');

    return new Response(manifest, {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60'
      }
    });
  } catch {
    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store'
      }
    });
  }
}
