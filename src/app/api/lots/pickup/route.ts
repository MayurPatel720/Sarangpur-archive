import { handleMutation } from '@/lib/api';
import { lotPickupBodySchema, lotPickupResponseSchema } from '@/types/lot';
import { setLotPickup } from '@/server/lots/pickup';

export const dynamic = 'force-dynamic';

/** POST /api/lots/pickup — move one of the caller's own lots between Newly arrived and Lots. */
export async function POST(req: Request) {
  return handleMutation(req, lotPickupBodySchema, lotPickupResponseSchema, {
    permission: 'lot:view',
    run: (body, ctx) => setLotPickup(body, ctx),
  });
}
