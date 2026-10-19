import { handleQuery } from '@/lib/api';
import { returnsQuerySchema, returnsResponseSchema } from '@/types/returns';
import { listReturns } from '@/server/returns/board';

export const dynamic = 'force-dynamic';

/** GET /api/returns — the Returns screen: things to hand back, or the handover history. `returns:view`. */
export async function GET(req: Request) {
  const parsed = returnsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query.', issues: parsed.error.issues }, { status: 400 });
  }
  return handleQuery(returnsResponseSchema, (ctx) => listReturns(parsed.data, ctx!), { permission: 'returns:view' });
}
