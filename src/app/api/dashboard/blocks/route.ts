import { handleQuery } from '@/lib/api';
import { getFormatBlocks } from '@/server/dashboard/queries';
import { blocksResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

/**
 * The dashboard hub's per-format counts. Requires a session because the counts
 * are filtered server-side by the caller's `format:*` grants — locked blocks
 * come back with null counts and never expose their numbers.
 */
export async function GET() {
  return handleQuery(
    blocksResponseSchema,
    (ctx) => getFormatBlocks(ctx?.grants ?? []),
    { permission: 'dashboard:view' },
  );
}
