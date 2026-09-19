import { handleMutation, handleQuery } from '@/lib/api';
import { listRoles } from '@/server/admin/queries';
import { createRole } from '@/server/admin/mutations';
import {
  roleCreateBodySchema,
  roleResponseSchema,
  rolesListResponseSchema,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(rolesListResponseSchema, async () => ({ roles: await listRoles() }), {
    permission: 'roles:manage',
  });
}

export async function POST(req: Request) {
  return handleMutation(req, roleCreateBodySchema, roleResponseSchema, {
    permission: 'roles:manage',
    // handleMutation types the body as the schema INPUT (defaults optional);
    // normalize here so createRole receives the resolved output shape.
    run: async (body, ctx) => ({
      role: await createRole(
        { key: body.key, label: body.label, rank: body.rank ?? 0, permissions: body.permissions ?? [] },
        ctx,
      ),
    }),
  });
}
