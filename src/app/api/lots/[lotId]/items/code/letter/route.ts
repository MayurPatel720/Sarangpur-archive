import { handleMutation } from '@/lib/api';
import { itemLetterBulkBodySchema, itemLetterBulkResponseSchema } from '@/types/items';
import { setItemLetters } from '@/server/lots/item-codes';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/items/code/letter — give many items the same code letter, `lot:edit`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemLetterBulkBodySchema, itemLetterBulkResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => setItemLetters(lotId, body, ctx),
  });
}
