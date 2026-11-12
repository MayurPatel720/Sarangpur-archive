import { handleMutation, handleQuery } from '@/lib/api';
import { masterColumnsBodySchema, masterColumnsResponseSchema } from '@/types/master';
import { listMasterColumns, updateMasterColumns } from '@/server/lots/master-columns';

export const dynamic = 'force-dynamic';

/** GET /api/items/master/columns — the Master Excel's custom columns, `lot:view`. */
export async function GET() {
  return handleQuery(masterColumnsResponseSchema, () => listMasterColumns(), { permission: 'lot:view' });
}

/**
 * PATCH /api/items/master/columns — add a custom column (anyone who can open the Master Excel) or
 * remove one (admins, `lists:manage`, checked inside). Body: `{ add: { label, kind, source } }` or `{ removeKey }`.
 */
export async function PATCH(req: Request) {
  return handleMutation(req, masterColumnsBodySchema, masterColumnsResponseSchema, {
    permission: 'lot:view',
    run: (body, ctx) => updateMasterColumns(body, ctx),
  });
}
