import { handleMutation } from '@/lib/api';
import { mlsBodySchema, mlsResponseSchema } from '@/types/ops';
import { tagMls } from '@/server/lots/operations';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/mls — manual tagging + outbox row, `mls:tag`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, mlsBodySchema, mlsResponseSchema, {
    permission: 'mls:tag',
    run: (body, ctx) => tagMls(lotId, body, ctx),
  });
}
