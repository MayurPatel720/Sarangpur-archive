import { handleMutation } from '@/lib/api';
import { taskChecklistBodySchema, taskMutationResponseSchema } from '@/types/task';
import { setTaskChecklist } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

/** PUT /api/tasks/[taskId]/checklist — replaces the checklist; assignee / creator / admin. */
export async function PUT(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, taskChecklistBodySchema, taskMutationResponseSchema, {
    permission: 'task:view',
    run: (body, ctx) => setTaskChecklist(taskId, body, ctx),
  });
}
