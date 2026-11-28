import { authorize, HttpError } from '@/lib/api';
import { isMediaSize, readMedia } from '@/server/media-disk';
// Which folder is read comes from the live Settings (Admin → Settings → Photo storage); see media-disk.ts.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string[] }> };

/**
 * GET /api/media/<key>[?size=thumb|medium|large] — a photo from the server's photo folder (STORAGE_DRIVER=disk).
 * Needs a signed-in user (photos are never public). Keys are unique and never overwritten, so the browser may keep them.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    await authorize();
  } catch (error) {
    if (error instanceof HttpError) return new Response(error.message, { status: error.status });
    throw error;
  }
  const { key } = await params;
  const sizeParam = new URL(req.url).searchParams.get('size');
  const found = await readMedia(key.map(decodeURIComponent).join('/'), isMediaSize(sizeParam) ? sizeParam : null);
  if (!found) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      'Content-Type': found.contentType,
      'Content-Length': String(found.bytes.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
