import { NextResponse } from 'next/server';
import { handleMutation, handleQuery } from '@/lib/api';
import {
  lotCreateBodySchema,
  lotCreateResponseSchema,
  lotListQuerySchema,
  lotListResponseSchema,
} from '@/types/lot';
import { listLots } from '@/server/lots/queries';
import { createIntake } from '@/server/lots/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/lots — the intake register. Server-side paginated, `lot:view`. */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = lotListQuerySchema.safeParse(params);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: first
          ? `Invalid query: ${first.path.join('.') || 'query'} — ${first.message}`
          : 'Invalid query.',
      },
      { status: 400 },
    );
  }
  return handleQuery(lotListResponseSchema, () => listLots(parsed.data), {
    permission: 'lot:view',
  });
}

/** POST /api/lots — creates an intake in one transaction, `lot:create`. → 201. */
export async function POST(req: Request) {
  return handleMutation(req, lotCreateBodySchema, lotCreateResponseSchema, {
    permission: 'lot:create',
    status: 201,
    run: (body, ctx) => createIntake(body, ctx),
  });
}
