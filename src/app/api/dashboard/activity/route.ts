import { handleQuery } from '@/lib/api';
import { getRecentActivity } from '@/server/dashboard/queries';
import { activityResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limitParam = new URL(request.url).searchParams.get('limit');
  const parsed = Number.parseInt(limitParam ?? '', 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 8;

  return handleQuery(activityResponseSchema, () => getRecentActivity(limit));
}
