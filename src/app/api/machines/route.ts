import { handleMutation, handleQuery, parseQueryParams } from '@/lib/api';
import {
  machineCreateBodySchema,
  machineListQuerySchema,
  machineListResponseSchema,
  machineResponseSchema,
} from '@/types/machine';
import { listMachines } from '@/server/machines/queries';
import { createMachine } from '@/server/machines/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/machines — the register: search / filter, server-paginated, with whole-register counters. */
export async function GET(req: Request) {
  return handleQuery(machineListResponseSchema, () => listMachines(parseQueryParams(machineListQuerySchema, req)), {
    permission: 'machine:view',
  });
}

/** POST /api/machines — add a machine (code MCH-0001… is allocated here). → 201. */
export async function POST(req: Request) {
  return handleMutation(req, machineCreateBodySchema, machineResponseSchema, {
    permission: 'machine:manage',
    status: 201,
    run: (body, ctx) => createMachine(body, ctx),
  });
}
