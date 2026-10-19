import { handleMultipart, handleQuery } from '@/lib/api';
import { itemImageResponseSchema, itemImagesResponseSchema } from '@/types/lot-image';
import { addItemImage, listItemImages } from '@/server/lots/item-images';
import { parseUpload } from '@/server/projects/images';

export const dynamic = 'force-dynamic';

/** Multipart body ceiling: the 4 MB file plus form-field overhead, under Vercel's 4.5 MB cap. */
const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

type Ctx = { params: Promise<{ lotId: string; itemId: string }> };

/** GET /api/lots/[lotId]/items/[itemId]/images — the item's photos, cover first by upload order, `lot:view`. */
export async function GET(_req: Request, { params }: Ctx) {
  const { lotId, itemId } = await params;
  return handleQuery(itemImagesResponseSchema, (ctx) => listItemImages(lotId, itemId, ctx!), { permission: 'lot:view' });
}

/** POST /api/lots/[lotId]/items/[itemId]/images — upload ONE photo (multipart: file). Max 5 per item. */
export async function POST(req: Request, { params }: Ctx) {
  const { lotId, itemId } = await params;
  return handleMultipart(req, itemImageResponseSchema, {
    permission: 'lot:view', // lot:edit + the assignee rule are enforced in the server layer
    maxBytes: MAX_BODY_BYTES,
    status: 201,
    run: (form, ctx) => addItemImage(lotId, itemId, parseUpload(form), ctx),
  });
}
