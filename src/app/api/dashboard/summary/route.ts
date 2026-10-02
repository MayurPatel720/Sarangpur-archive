import { handleQuery } from '@/lib/api';
import { getSummary } from '@/server/dashboard/queries';
import { requireFormatScope } from '@/server/format-scope';
import { summaryResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const formatParam = new URL(request.url).searchParams.get('format');
  return handleQuery(
    summaryResponseSchema,
    (ctx) => getSummary(new Date(), requireFormatScope(formatParam, ctx) ?? undefined),
    // Format-scoped reads need a session for the grant check; the global read
    // stays as open as it has always been.
    formatParam ? { session: true } : undefined,
  );
}
