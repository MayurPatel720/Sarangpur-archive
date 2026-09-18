import { handleQuery } from '@/lib/api';
import { getPipelineBoard } from '@/server/dashboard/queries';
import { pipelineResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(pipelineResponseSchema, () => getPipelineBoard());
}
