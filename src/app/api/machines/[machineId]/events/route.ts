import { handleMutation } from '@/lib/api';
import { machineEventBodySchema, machineResponseSchema } from '@/types/machine';
import { applyMachineEvent } from '@/server/machines/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/machines/[machineId]/events — spare parts, lending, repairs and servicing (see `type`). */
export async function POST(req: Request, { params }: { params: Promise<{ machineId: string }> }) {
  const { machineId } = await params;
  return handleMutation(req, machineEventBodySchema, machineResponseSchema, {
    permission: 'machine:manage',
    run: (body, ctx) => applyMachineEvent(machineId, body, ctx),
  });
}
