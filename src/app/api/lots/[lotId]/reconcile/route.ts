import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { reconcileResponseSchema } from '@/types/ops';
import { runReconcile } from '@/server/lots/operations';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lots/[lotId]/reconcile — diffs selected items against the FileIndex
 * inline (no job queue yet, so 200 with counts — never a fake 202), `reconcile:trigger`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, z.object({}), reconcileResponseSchema, {
    permission: 'reconcile:trigger',
    run: (_body, ctx) => runReconcile(lotId, ctx),
  });
}
