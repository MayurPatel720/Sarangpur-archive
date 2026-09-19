import { handleMutation, handleQuery } from '@/lib/api';
import {
  lotDetailResponseSchema,
  lotPatchBodySchema,
  lotPatchResponseSchema,
} from '@/types/lot';
import { getLotDetail } from '@/server/lots/queries';
import { patchLot } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId] — full record for the detail screen, `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(lotDetailResponseSchema, () => getLotDetail(lotId), {
    permission: 'lot:view',
  });
}

/** PATCH /api/lots/[lotId] — partial intake update, `lot:edit` (+ `lot:editTerminal`). */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, lotPatchBodySchema, lotPatchResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => patchLot(lotId, body, ctx),
  });
}
