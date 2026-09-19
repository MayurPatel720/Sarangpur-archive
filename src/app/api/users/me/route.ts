import { HttpError, handleQuery } from '@/lib/api';
import { meResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

/**
 * The caller's own identity plus live grants. Powers `useCan()` — UI gating
 * reads this, never the JWT, so a revoked permission hides its screens instantly.
 */
export async function GET() {
  return handleQuery(
    meResponseSchema,
    async (ctx) => {
      if (!ctx) throw new HttpError(401, 'Sign in to continue.');
      return {
        id: ctx.userId,
        name: ctx.userName,
        roleKey: ctx.roleKey,
        grants: ctx.grants,
      };
    },
    { session: true },
  );
}
