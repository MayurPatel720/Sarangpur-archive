import { NextResponse } from 'next/server';
import { handleQuery } from '@/lib/api';
import { searchLots } from '@/server/search/queries';
import { searchQuerySchema, searchResponseSchema } from '@/types/search';

export const dynamic = 'force-dynamic';

/** GET /api/search — global palette: lot text + item codes, format/stage chips. */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = searchQuerySchema.safeParse(params);
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
  return handleQuery(searchResponseSchema, () => searchLots(parsed.data), {
    permission: 'lot:view',
  });
}
