import { handleMutation } from '@/lib/api';
import { itemDuplicateBodySchema, itemDuplicateResponseSchema } from '@/types/items';
import { markDuplicate } from '@/server/lots/item-codes';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lots/[lotId]/items/duplicate — mark an item as a duplicate of another item
 * (any lot), `lot:edit`. `confirm: false` returns the plan only; `true` applies it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemDuplicateBodySchema, itemDuplicateResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => markDuplicate(lotId, body, ctx),
  });
}
