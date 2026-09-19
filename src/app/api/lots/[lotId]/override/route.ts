import { handleMutation } from '@/lib/api';
import {
  overrideDecideBodySchema,
  overrideRequestBodySchema,
  overrideResponseSchema,
} from '@/types/lot';
import { decideOverride, requestOverride } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/lots/[lotId]/override — opens an override request, `override:request`. */
export async function POST(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, overrideRequestBodySchema, overrideResponseSchema, {
    permission: 'override:request',
    run: (body, ctx) => requestOverride(lotId, body, ctx),
  });
}

/** PATCH /api/lots/[lotId]/override — approves or rejects it, `override:approve`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, overrideDecideBodySchema, overrideResponseSchema, {
    permission: 'override:approve',
    run: (body, ctx) => decideOverride(lotId, body, ctx),
  });
}
