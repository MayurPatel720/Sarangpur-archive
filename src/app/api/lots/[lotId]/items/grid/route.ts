import { handleMutation, handleQuery } from '@/lib/api';
import { itemsBulkBodySchema, itemsBulkResponseSchema, itemsGridResponseSchema } from '@/types/items';
import { bulkUpdateItems, getItemsGrid } from '@/server/lots/item-grid';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/items/grid — every item with details + decision, `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(
    itemsGridResponseSchema,
    (ctx) => getItemsGrid(lotId, { userId: ctx!.userId, grants: ctx!.grants }),
    { permission: 'lot:view' },
  );
}

/**
 * PATCH /api/lots/[lotId]/items/grid — set values on one or many items, `lot:edit`.
 * The assignee rule applies (withAudit). Deciding the last item decides the lot.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemsBulkBodySchema, itemsBulkResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => bulkUpdateItems(lotId, body, ctx),
  });
}
