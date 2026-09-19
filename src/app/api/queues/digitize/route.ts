import { z } from 'zod';
import { handleQuery } from '@/lib/api';
import { lotListResponseSchema } from '@/types/lot';
import { runQueue, queuePermission } from '@/server/queues/queues';

export const dynamic = 'force-dynamic';

const queueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** GET /api/queues/digitize — lots in scanning, oldest first, `digitize:view`. */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = queueQuerySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query.', issues: parsed.error.issues }, { status: 400 });
  }
  return handleQuery(
    lotListResponseSchema,
    () => runQueue('digitize', parsed.data.page, parsed.data.pageSize),
    { permission: queuePermission('digitize') },
  );
}
