import { handleMutation } from '@/lib/api';
import { importBodySchema, importResponseSchema } from '@/types/items';
import { importItems } from '@/server/lots/item-import';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/items/import — preview or apply rows read from an .xlsx, `lot:edit`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, importBodySchema, importResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => importItems(lotId, body, ctx),
  });
}
