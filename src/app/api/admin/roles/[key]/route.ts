import { handleMutation } from '@/lib/api';
import { patchRole } from '@/server/admin/mutations';
import { rolePatchBodySchema, roleResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return handleMutation(req, rolePatchBodySchema, roleResponseSchema, {
    permission: 'roles:manage',
    run: async (body, ctx) => ({ role: await patchRole(key, body, ctx) }),
  });
}
