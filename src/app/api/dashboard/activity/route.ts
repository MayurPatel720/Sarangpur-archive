import { handleQuery } from '@/lib/api';
import { getRecentActivity } from '@/server/dashboard/queries';
import { requireFormatScope } from '@/server/format-scope';
import { activityResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const parsed = Number.parseInt(limitParam ?? '', 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 8;
  const formatParam = searchParams.get('format');

  return handleQuery(
    activityResponseSchema,
    (ctx) =>
      getRecentActivity(limit, requireFormatScope(formatParam, ctx) ?? undefined),
    formatParam ? { session: true } : undefined,
  );
}
