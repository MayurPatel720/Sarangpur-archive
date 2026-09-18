import { handleQuery } from '@/lib/api';
import { getSummary } from '@/server/dashboard/queries';
import { summaryResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(summaryResponseSchema, () => getSummary());
}
