import { handleQuery } from '@/lib/api';
import { itemsQuerySchema, itemsResponseSchema } from '@/types/ops';
import { listItems } from '@/server/lots/queries';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/items — paginated items, `lot:view`. */
export async function GET(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const queryParams = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = itemsQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid query.', issues: parsed.error.issues }, { status: 400 });
  }
  return handleQuery(itemsResponseSchema, () => listItems(lotId, parsed.data), {
    permission: 'lot:view',
  });
}
