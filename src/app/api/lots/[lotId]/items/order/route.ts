import { handleMutation } from '@/lib/api';
import { itemOrderBodySchema, itemOrderResponseSchema } from '@/types/items';
import { reorderItems } from '@/server/lots/item-codes';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/items/order — save a drag of one sheet's rows, `lot:edit`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemOrderBodySchema, itemOrderResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => reorderItems(lotId, body, ctx),
  });
}
