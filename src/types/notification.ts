import { z } from 'zod';
import { NOTIFICATION_KINDS } from '@/lib/domain';

/** Notification contracts — the per-user inbox behind the header bell. */

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  taskId: z.string(),
  taskTitle: z.string(),
  text: z.string(),
  actorName: z.string(),
  createdAt: z.string(),
  read: z.boolean(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  rows: z.array(notificationSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  unreadCount: z.number(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

/** `ids` marks those; `all: true` marks every unread one. */
export const notificationReadBodySchema = z
  .object({
    ids: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/))
      .max(100)
      .optional(),
    all: z.boolean().optional(),
  })
  .refine((b) => b.all === true || (b.ids?.length ?? 0) > 0, {
    message: 'Say which notifications to mark read.',
  });
export type NotificationReadBody = z.infer<typeof notificationReadBodySchema>;

export const notificationReadResponseSchema = z.object({
  updated: z.number(),
  unreadCount: z.number(),
});
export type NotificationReadResponse = z.infer<typeof notificationReadResponseSchema>;
