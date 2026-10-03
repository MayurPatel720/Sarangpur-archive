import { HttpError, handleMutation } from '@/lib/api';
import { itemDispositionDoneBodySchema, itemDispositionDoneResponseSchema } from '@/types/items';
import { markItemDispositionsDone } from '@/server/lots/item-grid';

export const dynamic = 'force-dynamic';

/**
 * POST /api/items/dispositions — mark single items returned / discarded.
 * Needs `return:manage` for returns and `discard:confirm` for discards.
 */
export async function POST(req: Request) {
  return handleMutation(req, itemDispositionDoneBodySchema, itemDispositionDoneResponseSchema, {
    permission: 'lot:view',
    run: async (body, ctx) => {
      const need = body.kind === 'return' ? 'return:manage' : 'discard:confirm';
      if (!ctx.grants.includes(need)) throw new HttpError(403, `You need the ${need} permission.`);
      return markItemDispositionsDone(body, ctx);
    },
  });
}
