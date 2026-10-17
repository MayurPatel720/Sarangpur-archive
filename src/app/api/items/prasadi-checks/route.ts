import { handleMutation } from '@/lib/api';
import { prasadiCheckDoneBodySchema, prasadiCheckDoneResponseSchema } from '@/types/items';
import { markPrasadiChecked } from '@/server/lots/prasadi-checks';

export const dynamic = 'force-dynamic';

/** POST /api/items/prasadi-checks — record a quality check on Prasadi items. Needs `lot:edit`. */
export async function POST(req: Request) {
  return handleMutation(req, prasadiCheckDoneBodySchema, prasadiCheckDoneResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => markPrasadiChecked(body, ctx),
  });
}
