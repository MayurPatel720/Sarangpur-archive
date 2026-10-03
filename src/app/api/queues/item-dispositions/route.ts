import { handleQuery } from '@/lib/api';
import { itemDispositionListSchema, itemDispositionQuerySchema } from '@/types/items';
import { listItemDispositions } from '@/server/lots/item-grid';

export const dynamic = 'force-dynamic';

/** GET /api/queues/item-dispositions?kind=return|discard — single items to hand back or discard. */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = itemDispositionQuerySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query.', issues: parsed.error.issues }, { status: 400 });
  }
  return handleQuery(itemDispositionListSchema, () => listItemDispositions(parsed.data), {
    permission: parsed.data.kind === 'return' ? 'returns:view' : 'discards:view',
  });
}
