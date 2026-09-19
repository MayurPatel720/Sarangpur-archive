import { handleQuery } from '@/lib/api';
import { activityQuerySchema, activityResponseSchema } from '@/types/ops';
import { listActivity } from '@/server/lots/queries';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/activity — per-record audit trail, newest first, `lot:view`. */
export async function GET(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const queryParams = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = activityQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query.', issues: parsed.error.issues }, { status: 400 });
  }
  return handleQuery(activityResponseSchema, () => listActivity(lotId, parsed.data), {
    permission: 'lot:view',
  });
}
