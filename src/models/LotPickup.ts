import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * "I have picked this lot up" — a PRIVATE, per-person view flag behind the
 * "Newly arrived" / "Lots" split on My lots. A lot assigned to a person counts as
 * newly arrived for them until a record exists for (user, lot). Reassigning a lot
 * naturally shows it as newly arrived for the new assignee (no record for them).
 *
 * Personal view state, not a business mutation: it is never shown to others, not
 * written to ActivityLog and does not touch ArchiveLot (same precedent as the
 * Notification read-state in models/Notification.ts).
 */
const lotPickupSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'lot_pickups' },
);

lotPickupSchema.index({ user: 1, lot: 1 }, { unique: true }); // one flag per person per lot
lotPickupSchema.index({ user: 1 }); // resolve a person's accepted lot ids

export type LotPickupDoc = InferSchemaType<typeof lotPickupSchema>;

export const LotPickup: Model<LotPickupDoc> =
  (models.LotPickup as Model<LotPickupDoc>) ?? model<LotPickupDoc>('LotPickup', lotPickupSchema);
