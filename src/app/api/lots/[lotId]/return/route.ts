import { handleMutation } from '@/lib/api';
import { returnBodySchema, returnResponseSchema } from '@/types/ops';
import { manageReturn } from '@/server/lots/operations';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/return — request / progress / complete a return, `return:manage`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, returnBodySchema, returnResponseSchema, {
    permission: 'return:manage',
    run: (body, ctx) => manageReturn(lotId, body, ctx),
  });
}
