import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

export const MLS_OPERATIONS = ['create_record', 'apply_tags', 'resolve_duplicate'] as const;
export const MLS_OUTBOX_STATUSES = ['pending', 'sent', 'failed'] as const;

/**
 * Outbox for MLS integration. Never call MLS inside a request — write a row here in
 * the same transaction as the tagging change, and `jobs/mls-sync.ts` drains it with
 * exponential backoff. The MLS queue screen's "failed sync calls" panel reads the
 * `failed` rows. Manual-tagging v1 still writes rows so the sync job works untouched
 * when the MLS server is connected later.
 */
const mlsOutboxSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true, index: true },
    itemCode: { type: String, trim: true, default: null },
    operation: { type: String, required: true, enum: MLS_OPERATIONS },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, required: true, enum: MLS_OUTBOX_STATUSES, default: 'pending' },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    lastError: { type: String, trim: true, default: null },
    nextAttemptAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'mlsoutbox' },
);

// The drain query: oldest due, pending-or-retryable first.
mlsOutboxSchema.index({ status: 1, nextAttemptAt: 1 });

export type MlsOutboxDoc = InferSchemaType<typeof mlsOutboxSchema>;

export const MlsOutbox: Model<MlsOutboxDoc> =
  (models.MlsOutbox as Model<MlsOutboxDoc>) ?? model<MlsOutboxDoc>('MlsOutbox', mlsOutboxSchema);
