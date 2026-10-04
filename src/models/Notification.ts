import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { NOTIFICATION_KINDS } from '@/lib/domain';

/**
 * A per-user inbox entry raised by a task event (assigned, reassigned, comment,
 * blocked, done, …). The dashboard alerts are computed purely from lot data and cannot
 * carry events, so task events get this small collection; the header bell adds its
 * unread count to the alert count.
 *
 * `text`, `taskTitle` and `actorName` are denormalised at write time and never
 * back-filled — a notification records what was true when it was raised.
 * Marking read is a personal read-state flag, not a business mutation, so it is not
 * audited (the task event that raised it already is).
 */
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, required: true, enum: NOTIFICATION_KINDS },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    taskTitle: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
    actorName: { type: String, required: true, trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' },
);

notificationSchema.index({ user: 1, createdAt: -1 }); // inbox list, newest first
notificationSchema.index({ user: 1, readAt: 1 }); // unread count

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;

export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc>) ??
  model<NotificationDoc>('Notification', notificationSchema);
