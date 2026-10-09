import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { taskMutationResponseSchema, taskPersonalUpdateBodySchema } from '@/types/task';
import { deletePersonalTask, updatePersonalTask } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

/** PATCH /api/tasks/mine/[taskId] — edit your own to-do (title, note, importance, due date). */
export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, taskPersonalUpdateBodySchema, taskMutationResponseSchema, {
    permission: 'task:view',
    run: (body, ctx) => updatePersonalTask(taskId, body, ctx),
  });
}

/** DELETE /api/tasks/mine/[taskId] — delete your own to-do. */
export async function DELETE(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, z.object({}).passthrough(), z.object({ ok: z.literal(true) }), {
    permission: 'task:view',
    run: (_body, ctx) => deletePersonalTask(taskId, ctx),
  });
}
