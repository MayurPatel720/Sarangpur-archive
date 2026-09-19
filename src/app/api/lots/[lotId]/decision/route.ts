import { handleMutation } from '@/lib/api';
import { decisionBodySchema, decisionResponseSchema } from '@/types/lot';
import { recordDecision } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/decision — records the checklist, `decision:record`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, decisionBodySchema, decisionResponseSchema, {
    permission: 'decision:record',
    run: (body, ctx) => recordDecision(lotId, body, ctx),
  });
}
