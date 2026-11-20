import { handleMutation } from '@/lib/api';
import { docStageBodySchema, docStageResponseSchema } from '@/types/lot';
import { moveDocumentStage } from '@/server/lots/documents';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/stage — move a letters lot to the next / previous stage, `lot:edit`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, docStageBodySchema, docStageResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => moveDocumentStage(lotId, body, ctx),
  });
}
