import { handleQuery } from '@/lib/api';
import { triageItemsResponseSchema } from '@/types/triage';
import { listTriageItems } from '@/server/lots/queries';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/triage — every item of one lot, unsliced, `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(triageItemsResponseSchema, () => listTriageItems(lotId), {
    permission: 'lot:view',
  });
}
