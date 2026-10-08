import { handleMutation } from '@/lib/api';
import { itemNumberBodySchema, itemNumberResponseSchema } from '@/types/items';
import { setItemNumber } from '@/server/lots/item-codes';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/items/code — change one item's number to a free one, `lot:edit`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemNumberBodySchema, itemNumberResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => setItemNumber(lotId, body, ctx),
  });
}
