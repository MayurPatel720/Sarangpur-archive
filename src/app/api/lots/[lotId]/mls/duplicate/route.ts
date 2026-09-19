import { handleMutation } from '@/lib/api';
import { duplicateBodySchema, duplicateResponseSchema } from '@/types/ops';
import { resolveDuplicate } from '@/server/lots/operations';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/mls/duplicate — lead+ resolves a flagged duplicate, `duplicate:resolve`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, duplicateBodySchema, duplicateResponseSchema, {
    permission: 'duplicate:resolve',
    run: (body, ctx) => resolveDuplicate(lotId, body, ctx),
  });
}
