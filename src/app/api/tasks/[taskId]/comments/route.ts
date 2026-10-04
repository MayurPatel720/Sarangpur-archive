import { handleMutation } from '@/lib/api';
import { taskCommentBodySchema, taskMutationResponseSchema } from '@/types/task';
import { addTaskComment } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/[taskId]/comments — assignee / creator / admin. → 201. */
export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, taskCommentBodySchema, taskMutationResponseSchema, {
    permission: 'task:view',
    status: 201,
    run: (body, ctx) => addTaskComment(taskId, body, ctx),
  });
}
