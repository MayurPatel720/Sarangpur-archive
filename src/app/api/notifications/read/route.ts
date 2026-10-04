import { handleMutation } from '@/lib/api';
import { notificationReadBodySchema, notificationReadResponseSchema } from '@/types/notification';
import { markNotificationsRead } from '@/server/tasks/notifications';

export const dynamic = 'force-dynamic';

/** POST /api/notifications/read — mark some / all of the caller's notifications read. */
export async function POST(req: Request) {
  return handleMutation(req, notificationReadBodySchema, notificationReadResponseSchema, {
    permission: 'task:view',
    run: (body, ctx) => markNotificationsRead(body, ctx),
  });
}
