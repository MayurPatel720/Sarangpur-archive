import { handleMutation } from '@/lib/api';
import { patchUser } from '@/server/admin/mutations';
import { userPatchBodySchema, userResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return handleMutation(req, userPatchBodySchema, userResponseSchema, {
    permission: 'user:manage',
    run: async (body, ctx) => ({ user: await patchUser(userId, body, ctx) }),
  });
}
