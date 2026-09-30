import { handleQuery } from '@/lib/api';
import { listUserPicker } from '@/server/admin/queries';
import { userPickerResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

/**
 * Active user names for form dropdowns (e.g. register Receiver filter).
 * Any signed-in user may read — listing names is not user management.
 */
export async function GET() {
  return handleQuery(userPickerResponseSchema, async () => ({
    users: await listUserPicker(),
  }), { session: true });
}
