import { handleQuery, parseQueryParams } from '@/lib/api';
import { prasadiCheckListSchema, prasadiCheckQuerySchema } from '@/types/items';
import { listPrasadiChecks } from '@/server/lots/prasadi-checks';

export const dynamic = 'force-dynamic';

/** GET /api/queues/prasadi-checks — Prasadi items due for a quality check, oldest first. */
export async function GET(req: Request) {
  return handleQuery(
    prasadiCheckListSchema,
    () => listPrasadiChecks(parseQueryParams(prasadiCheckQuerySchema, req)),
    { permission: 'lot:view' },
  );
}
