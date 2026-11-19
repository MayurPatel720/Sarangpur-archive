import { handleMutation, handleQuery } from '@/lib/api';
import { layoutQuerySchema, layoutResponseSchema, layoutSaveBodySchema } from '@/types/layout';
import { getLayout, saveLayout } from '@/server/layouts';

export const dynamic = 'force-dynamic';

/** GET /api/me/layouts?scope=items — the caller's saved layout of a sheet (own data, needs a session). */
export async function GET(req: Request) {
  const scope = layoutQuerySchema.safeParse({ scope: new URL(req.url).searchParams.get('scope') ?? '' });
  return handleQuery(
    layoutResponseSchema,
    async (ctx) => {
      if (!scope.success) throw new (await import('@/lib/api')).HttpError(400, 'Unknown sheet.');
      return getLayout(scope.data.scope, ctx!);
    },
    { session: true },
  );
}

/** PUT /api/me/layouts — save the caller's layout of a sheet, or `layout: null` to forget it. */
export async function PUT(req: Request) {
  return handleMutation(req, layoutSaveBodySchema, layoutResponseSchema, {
    permission: 'lot:view',
    run: (body, ctx) => saveLayout(body, ctx),
  });
}
