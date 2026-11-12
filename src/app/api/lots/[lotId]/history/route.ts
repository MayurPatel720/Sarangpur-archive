import { handleMutation, handleQuery } from '@/lib/api';
import { historyActionBodySchema, historyActionResponseSchema, historyListResponseSchema } from '@/types/history';
import { assertCanViewHistory, listHistory, runHistoryAction } from '@/server/lots/history';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/history — sessions, saved versions, and what Undo / Redo would do for the caller. `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(
    historyListResponseSchema,
    async (ctx) => {
      await assertCanViewHistory(lotId, ctx!.grants);
      return listHistory(lotId, ctx!);
    },
    { permission: 'lot:view' },
  );
}

/**
 * POST /api/lots/[lotId]/history — `{ action: 'undo' | 'redo' | 'undoSession' | 'restore' | 'saveVersion', … }`.
 * `lot:edit`; the assignee rule applies (withAudit). A conflict is returned as `done: false` with the cells,
 * and nothing is changed until the caller sends `skipConflicts: true`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, historyActionBodySchema, historyActionResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => runHistoryAction(lotId, body, ctx),
  });
}
