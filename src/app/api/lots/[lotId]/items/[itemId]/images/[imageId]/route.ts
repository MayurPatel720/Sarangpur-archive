import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { itemImagePatchBodySchema, itemImageResponseSchema, lotImageDeleteResponseSchema } from '@/types/lot-image';
import { deleteItemImage, setItemCover } from '@/server/lots/item-images';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ lotId: string; itemId: string; imageId: string }> };

/** PATCH …/images/[imageId] — make it the item's cover. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { lotId, itemId, imageId } = await params;
  return handleMutation(req, itemImagePatchBodySchema, itemImageResponseSchema, {
    permission: 'lot:view',
    run: (_body, ctx) => setItemCover(lotId, itemId, imageId, ctx),
  });
}

/** DELETE …/images/[imageId] — remove the photo and its Cloudinary asset. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { lotId, itemId, imageId } = await params;
  return handleMutation(req, z.unknown(), lotImageDeleteResponseSchema, {
    permission: 'lot:view',
    run: (_body, ctx) => deleteItemImage(lotId, itemId, imageId, ctx),
  });
}
