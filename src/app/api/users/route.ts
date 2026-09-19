import { handleMutation, handleQuery } from '@/lib/api';
import { listUsers } from '@/server/admin/queries';
import { createUser } from '@/server/admin/mutations';
import {
  userCreateBodySchema,
  userResponseSchema,
  usersResponseSchema,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(usersResponseSchema, async () => ({ users: await listUsers() }), {
    permission: 'user:manage',
  });
}

export async function POST(req: Request) {
  return handleMutation(req, userCreateBodySchema, userResponseSchema, {
    permission: 'user:manage',
    run: async (body, ctx) => ({ user: await createUser(body, ctx) }),
  });
}
