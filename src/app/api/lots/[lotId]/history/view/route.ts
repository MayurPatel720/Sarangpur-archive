import { handleQuery, parseQueryParams } from '@/lib/api';
import { historyViewQuerySchema, historyViewResponseSchema } from '@/types/history';
import { assertCanViewHistory, getHistoryView } from '@/server/lots/history';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lots/[lotId]/history/view?mode=session|version|since — the sheet at a point in history (read only) with its
 * changed cells to highlight, or (mode `since`) just the changes of the current sheet since a point. `lot:view`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(
    historyViewResponseSchema,
    async (ctx) => {
      await assertCanViewHistory(lotId, ctx!.grants);
      return getHistoryView(lotId, ctx!, parseQueryParams(historyViewQuerySchema, req));
    },
    { permission: 'lot:view' },
  );
}
