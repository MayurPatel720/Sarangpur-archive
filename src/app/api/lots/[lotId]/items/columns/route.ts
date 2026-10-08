import { handleMutation } from '@/lib/api';
import { columnsBodySchema, columnsResponseSchema } from '@/types/items';
import { updateColumns } from '@/server/lots/item-codes';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/items/columns — hide / unhide, add or remove a column for this lot's Excel, `lot:edit`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, columnsBodySchema, columnsResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => updateColumns(lotId, body, ctx),
  });
}
