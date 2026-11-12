import { handleQuery } from '@/lib/api';
import { historyChangeDetailSchema } from '@/types/history';
import { assertCanViewHistory, changeDetail } from '@/server/lots/history';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/history/changes/[changeSetId] — the cells one change touched (old → new). `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string; changeSetId: string }> }) {
  const { lotId, changeSetId } = await params;
  return handleQuery(
    historyChangeDetailSchema,
    async (ctx) => {
      await assertCanViewHistory(lotId, ctx!.grants);
      return changeDetail(lotId, changeSetId);
    },
    { permission: 'lot:view' },
  );
}
