import { z } from 'zod';
import { handleMutation, handleQuery } from '@/lib/api';
import { machineDeleteResponseSchema, machinePatchBodySchema, machineResponseSchema } from '@/types/machine';
import { getMachine } from '@/server/machines/queries';
import { deleteMachine, updateMachine } from '@/server/machines/mutations';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ machineId: string }> };

/** GET /api/machines/[machineId] — one machine with its parts, loans, repairs and history. */
export async function GET(_req: Request, { params }: Ctx) {
  const { machineId } = await params;
  return handleQuery(machineResponseSchema, () => getMachine(machineId), { permission: 'machine:view' });
}

/** PATCH /api/machines/[machineId] — edit details; condition / usage changes are logged in history. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { machineId } = await params;
  return handleMutation(req, machinePatchBodySchema, machineResponseSchema, {
    permission: 'machine:manage',
    run: (body, ctx) => updateMachine(machineId, body, ctx),
  });
}

/** DELETE /api/machines/[machineId] — remove a machine and everything recorded on it. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { machineId } = await params;
  return handleMutation(req, z.unknown(), machineDeleteResponseSchema, {
    permission: 'machine:manage',
    run: () => deleteMachine(machineId),
  });
}
