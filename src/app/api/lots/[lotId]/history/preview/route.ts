import { handleQuery, parseQueryParams } from '@/lib/api';
import { historyPreviewQuerySchema, historyPreviewSchema } from '@/types/history';
import { assertCanViewHistory, previewRestore } from '@/server/lots/history';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/history/preview?versionId|seq — what restoring would change; also "Compare". `lot:view`. */
export async function GET(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(
    historyPreviewSchema,
    async (ctx) => {
      await assertCanViewHistory(lotId, ctx!.grants);
      return previewRestore(lotId, parseQueryParams(historyPreviewQuerySchema, req));
    },
    { permission: 'lot:view' },
  );
}
