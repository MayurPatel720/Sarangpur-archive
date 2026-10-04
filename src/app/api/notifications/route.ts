import { handleQuery, parseQueryParams } from '@/lib/api';
import { notificationListQuerySchema, notificationListResponseSchema } from '@/types/notification';
import { listNotifications } from '@/server/tasks/notifications';
import { requireCtx } from '@/server/tasks/queries';

export const dynamic = 'force-dynamic';

/** GET /api/notifications — the caller's inbox + unread count (the bell), `task:view`. */
export async function GET(req: Request) {
  return handleQuery(
    notificationListResponseSchema,
    (ctx) => listNotifications(parseQueryParams(notificationListQuerySchema, req), requireCtx(ctx)),
    { permission: 'task:view' },
  );
}
