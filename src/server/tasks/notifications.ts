import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import type { MutationContext } from '@/lib/api';
import { Notification } from '@/models/Notification';
import type {
  NotificationListQuery,
  NotificationListResponse,
  NotificationReadBody,
  NotificationReadResponse,
} from '@/types/notification';

/** The caller's own inbox, newest first, paginated server-side, plus the unread count for the bell. */
export async function listNotifications(
  query: NotificationListQuery,
  ctx: MutationContext,
): Promise<NotificationListResponse> {
  await connectToDatabase();
  const user = new Types.ObjectId(ctx.userId);
  const [docs, total, unreadCount] = await Promise.all([
    Notification.find({ user })
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Notification.countDocuments({ user }),
    Notification.countDocuments({ user, readAt: null }),
  ]);
  return {
    rows: docs.map((d) => ({
      id: String(d._id),
      kind: d.kind as NotificationListResponse['rows'][number]['kind'],
      taskId: String(d.task),
      taskTitle: d.taskTitle,
      text: d.text,
      actorName: d.actorName,
      createdAt: new Date(d.createdAt).toISOString(),
      read: d.readAt != null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    unreadCount,
  };
}

/** Personal read-state only (not audited — see models/Notification.ts). Scoped to the caller. */
export async function markNotificationsRead(
  body: NotificationReadBody,
  ctx: MutationContext,
): Promise<NotificationReadResponse> {
  await connectToDatabase();
  const user = new Types.ObjectId(ctx.userId);
  const filter = {
    user,
    readAt: null,
    ...(body.all ? {} : { _id: { $in: (body.ids ?? []).map((i) => new Types.ObjectId(i)) } }),
  };
  const res = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  const unreadCount = await Notification.countDocuments({ user, readAt: null });
  return { updated: res.modifiedCount, unreadCount };
}
