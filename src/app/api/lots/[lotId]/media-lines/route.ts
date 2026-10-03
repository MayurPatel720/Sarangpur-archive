import { handleMutation } from '@/lib/api';
import { lotMediaLinesBodySchema, lotMediaLinesResponseSchema } from '@/types/lot';
import { replaceMediaLines } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** PUT /api/lots/[lotId]/media-lines — replace quantities while in Intake, `lot:edit`. */
export async function PUT(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, lotMediaLinesBodySchema, lotMediaLinesResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => replaceMediaLines(lotId, body, ctx),
  });
}
