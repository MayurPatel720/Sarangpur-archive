import { handleMutation } from '@/lib/api';
import { itemStatusBodySchema, itemStatusResponseSchema } from '@/types/items';
import { changeItemStatus } from '@/server/lots/item-status';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/items/status — remove a Prasadi item from the archive, correct its removal details, or make it active again. `lot:edit`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemStatusBodySchema, itemStatusResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => changeItemStatus(lotId, body, ctx),
  });
}
