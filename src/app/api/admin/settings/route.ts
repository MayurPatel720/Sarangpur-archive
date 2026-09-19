import { handleMutation, handleQuery } from '@/lib/api';
import { getSettings } from '@/server/admin/queries';
import { patchSettings } from '@/server/admin/mutations';
import { settingsPatchBodySchema, settingsResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(settingsResponseSchema, async () => ({ settings: await getSettings() }), {
    permission: 'settings:manage',
  });
}

export async function PATCH(req: Request) {
  return handleMutation(req, settingsPatchBodySchema, settingsResponseSchema, {
    permission: 'settings:manage',
    run: async (body, ctx) => ({ settings: await patchSettings(body, ctx) }),
  });
}
