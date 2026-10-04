import { handleMutation, handleQuery, parseQueryParams } from '@/lib/api';
import {
  taskCreateBodySchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskMutationResponseSchema,
} from '@/types/task';
import { listTasks, requireCtx } from '@/server/tasks/queries';
import { createTask } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/tasks — paginated, filtered list. `task:view`; non-admins see only their own. */
export async function GET(req: Request) {
  return handleQuery(
    taskListResponseSchema,
    (ctx) => listTasks(parseQueryParams(taskListQuerySchema, req), requireCtx(ctx)),
    { permission: 'task:view' },
  );
}

/** POST /api/tasks — admin assigns a new task, `task:assign`. → 201. */
export async function POST(req: Request) {
  return handleMutation(req, taskCreateBodySchema, taskMutationResponseSchema, {
    permission: 'task:assign',
    status: 201,
    run: (body, ctx) => createTask(body, ctx),
  });
}
