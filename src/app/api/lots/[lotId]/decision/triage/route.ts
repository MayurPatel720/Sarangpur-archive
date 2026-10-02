import { handleMutation } from '@/lib/api';
import { triageBulkBodySchema, triageBulkResponseSchema } from '@/types/triage';
import { recordTriageDecision } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/decision/triage — bulk triage save, `decision:record`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, triageBulkBodySchema, triageBulkResponseSchema, {
    permission: 'decision:record',
    run: (body, ctx) => recordTriageDecision(lotId, body, ctx),
  });
}
