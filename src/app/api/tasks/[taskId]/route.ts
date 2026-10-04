import { z } from 'zod';
import { handleMutation, handleQuery, parseQueryParams } from '@/lib/api';
import {
  isoDaySchema,
  taskDetailResponseSchema,
  taskMutationResponseSchema,
  taskUpdateBodySchema,
} from '@/types/task';
import { getTaskDetail, requireCtx } from '@/server/tasks/queries';
import { updateTask } from '@/server/tasks/mutations';

export const dynamic = 'force-dynamic';

const detailQuerySchema = z.object({ today: isoDaySchema.optional() });

/** GET /api/tasks/[taskId] — task, checklist, comments, history. 404 when not yours. */
export async function GET(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleQuery(
    taskDetailResponseSchema,
    (ctx) => getTaskDetail(taskId, requireCtx(ctx), parseQueryParams(detailQuerySchema, req).today),
    { permission: 'task:view' },
  );
}

/** PATCH /api/tasks/[taskId] — admin edits / reassigns, `task:assign`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, taskUpdateBodySchema, taskMutationResponseSchema, {
    permission: 'task:assign',
    run: (body, ctx) => updateTask(taskId, body, ctx),
  });
}
