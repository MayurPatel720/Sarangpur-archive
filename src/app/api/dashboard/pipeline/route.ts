import { handleQuery } from '@/lib/api';
import { getPipelineBoard } from '@/server/dashboard/queries';
import { requireFormatScope } from '@/server/format-scope';
import { pipelineResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const formatParam = new URL(request.url).searchParams.get('format');
  return handleQuery(
    pipelineResponseSchema,
    (ctx) => getPipelineBoard(new Date(), requireFormatScope(formatParam, ctx) ?? undefined),
    formatParam ? { session: true } : undefined,
  );
}
