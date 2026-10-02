import { handleMutation, handleQuery } from '@/lib/api';
import { itemsQuerySchema, itemsResponseSchema } from '@/types/ops';
import { itemCreateBodySchema, itemCreateResponseSchema } from '@/types/project';
import { listItems } from '@/server/lots/queries';
import { createItem } from '@/server/lots/items';

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

/** POST /api/lots/[lotId]/items — volunteer adds one item manually, `item:create`. → 201. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, itemCreateBodySchema, itemCreateResponseSchema, {
    permission: 'item:create',
    status: 201,
    run: (body, ctx) => createItem(lotId, body, ctx),
  });
}
