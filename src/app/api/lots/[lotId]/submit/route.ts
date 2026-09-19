import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { submitResponseSchema } from '@/types/lot';
import { submitForDecision } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/submit — moves an intake lot into the decision queue, `lot:edit`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, z.object({}), submitResponseSchema, {
    permission: 'lot:edit',
    run: (_body, ctx) => submitForDecision(lotId, ctx),
  });
}
