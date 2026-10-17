import { handleMultipart, handleQuery } from '@/lib/api';
import { lotImageResponseSchema, lotImagesResponseSchema } from '@/types/lot-image';
import { addLotImage, listLotImages } from '@/server/lots/images';
import { parseUpload } from '@/server/projects/images';

export const dynamic = 'force-dynamic';

/** Multipart body ceiling: the 4 MB file plus form-field overhead, under Vercel's 4.5 MB cap. */
const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

/** GET /api/lots/[lotId]/images — gallery, newest first, `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(lotImagesResponseSchema, (ctx) => listLotImages(lotId, ctx!), { permission: 'lot:view' });
}

/** POST /api/lots/[lotId]/images — upload ONE photo (multipart: file, caption?). lot:edit + assignee rule in the server layer. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMultipart(req, lotImageResponseSchema, {
    permission: 'lot:view',
    maxBytes: MAX_BODY_BYTES,
    status: 201,
    run: (form, ctx) => addLotImage(lotId, parseUpload(form), ctx),
  });
}
