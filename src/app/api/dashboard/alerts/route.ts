import { handleQuery } from '@/lib/api';
import { getAlerts } from '@/server/dashboard/queries';
import { alertsResponseSchema } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(alertsResponseSchema, () => getAlerts());
}
