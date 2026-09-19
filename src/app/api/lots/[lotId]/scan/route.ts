import { handleMutation } from '@/lib/api';
import { scanBodySchema, scanResponseSchema } from '@/types/ops';
import { recordScan } from '@/server/lots/operations';

export const dynamic = 'force-dynamic';

/** PATCH /api/lots/[lotId]/scan — records scan status + folder path, `scan:record`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, scanBodySchema, scanResponseSchema, {
    permission: 'scan:record',
    run: (body, ctx) => recordScan(lotId, body, ctx),
  });
}
