import { handleMutation } from '@/lib/api';
import { taskMutationResponseSchema, taskStatusBodySchema } from '@/types/task';
import { setTaskStatus } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/[taskId]/status — assignee / creator / admin; cancelling needs `task:assign`. */
export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, taskStatusBodySchema, taskMutationResponseSchema, {
    permission: 'task:view',
    run: (body, ctx) => setTaskStatus(taskId, body, ctx),
  });
}
