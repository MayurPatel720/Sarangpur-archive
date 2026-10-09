import { handleMutation } from '@/lib/api';
import { returnRecordBodySchema, returnRecordResponseSchema } from '@/types/returns';
import { recordReturn } from '@/server/returns/record';

export const dynamic = 'force-dynamic';

/** POST /api/returns/record — record a handover (who received it, how, when), `return:manage`. */
export async function POST(req: Request) {
  return handleMutation(req, returnRecordBodySchema, returnRecordResponseSchema, {
    permission: 'return:manage',
    run: (body, ctx) => recordReturn(body, ctx),
  });
}
