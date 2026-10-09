import { handleMutation } from '@/lib/api';
import { taskMutationResponseSchema, taskPersonalCreateBodySchema } from '@/types/task';
import { createPersonalTask } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/mine — add a private to-do for yourself, `task:view`. → 201. */
export async function POST(req: Request) {
  return handleMutation(req, taskPersonalCreateBodySchema, taskMutationResponseSchema, {
    permission: 'task:view',
    status: 201,
    run: (body, ctx) => createPersonalTask(body, ctx),
  });
}
