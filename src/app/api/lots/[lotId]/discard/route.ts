import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { discardBodySchema, discardResponseSchema } from '@/types/ops';
import { confirmDiscard, reverseDiscard } from '@/server/lots/operations';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/discard — reviewer+ confirms, `discard:confirm`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, discardBodySchema, discardResponseSchema, {
    permission: 'discard:confirm',
    run: (body, ctx) => confirmDiscard(lotId, body, ctx),
  });
}

/** DELETE /api/lots/[lotId]/discard — admin-only reversal back to metadata, `discard:reverse`. */
export async function DELETE(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(
    req,
    z.object({ version: z.number().int().min(0) }).strict(),
    discardResponseSchema,
    {
      permission: 'discard:reverse',
      run: (body, ctx) => reverseDiscard(lotId, body.version, ctx),
    },
  );
}
