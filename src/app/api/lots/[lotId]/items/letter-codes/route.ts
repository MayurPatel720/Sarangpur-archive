import { handleMutation } from '@/lib/api';
import { letterCodesBodySchema, letterCodesResponseSchema } from '@/types/items';
import { setLetterCodes } from '@/server/lots/documents';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/items/letter-codes — set letters' codes from their scanned files' names, `lot:edit`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, letterCodesBodySchema, letterCodesResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => setLetterCodes(lotId, body, ctx),
  });
}
