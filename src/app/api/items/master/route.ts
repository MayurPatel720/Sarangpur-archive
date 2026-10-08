import { handleQuery, parseQueryParams } from '@/lib/api';
import { masterQuerySchema, masterResponseSchema } from '@/types/master';
import { listMasterItems } from '@/server/lots/master-items';

export const dynamic = 'force-dynamic';

/**
 * GET /api/items/master — the Master Excel: every item the caller may see, with lot and
 * project, filtered and paginated server-side. `lot:view`; bounded by the caller's `format:*` grants.
 */
export async function GET(req: Request) {
  return handleQuery(masterResponseSchema, (ctx) => listMasterItems(parseQueryParams(masterQuerySchema, req), ctx!), {
    permission: 'lot:view',
  });
}
