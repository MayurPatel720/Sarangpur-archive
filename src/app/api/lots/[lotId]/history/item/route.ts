import { handleQuery, parseQueryParams } from '@/lib/api';
import { historyItemQuerySchema, historyItemResponseSchema } from '@/types/history';
import { assertCanViewHistory, itemHistory } from '@/server/lots/history';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/history/item?itemId|code&path — every recorded change of one item or cell. `lot:view`. */
export async function GET(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(
    historyItemResponseSchema,
    async (ctx) => {
      await assertCanViewHistory(lotId, ctx!.grants);
      return itemHistory(lotId, parseQueryParams(historyItemQuerySchema, req));
    },
    { permission: 'lot:view' },
  );
}
