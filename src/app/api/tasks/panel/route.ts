import { handleQuery, parseQueryParams } from '@/lib/api';
import { taskPanelQuerySchema, taskPanelResponseSchema } from '@/types/task';
import { getTaskPanel, requireCtx } from '@/server/tasks/queries';
import { requireFormatScope } from '@/server/format-scope';

export const dynamic = 'force-dynamic';

/** GET /api/tasks/panel — Today's tasks groups + derived lot rows (+ people strip for admins). */
export async function GET(req: Request) {
  return handleQuery(
    taskPanelResponseSchema,
    (ctx) => {
      const query = parseQueryParams(taskPanelQuerySchema, req);
      // A format dashboard is already behind its `format:*` grant; keep the API consistent.
      requireFormatScope(query.format ?? null, ctx);
      return getTaskPanel(query, requireCtx(ctx));
    },
    { permission: 'task:view' },
  );
}
