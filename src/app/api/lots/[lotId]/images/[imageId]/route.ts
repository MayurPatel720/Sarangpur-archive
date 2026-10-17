import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { lotImageDeleteResponseSchema } from '@/types/lot-image';
import { deleteLotImage } from '@/server/lots/images';

export const dynamic = 'force-dynamic';

/** DELETE /api/lots/[lotId]/images/[imageId] — remove the document and its Cloudinary asset. */
export async function DELETE(req: Request, { params }: { params: Promise<{ lotId: string; imageId: string }> }) {
  const { lotId, imageId } = await params;
  return handleMutation(req, z.unknown(), lotImageDeleteResponseSchema, {
    permission: 'lot:view', // lot:edit + the assignee rule are enforced in the server layer
    run: (_body, ctx) => deleteLotImage(lotId, imageId, ctx),
  });
}
