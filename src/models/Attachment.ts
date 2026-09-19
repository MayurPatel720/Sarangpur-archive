import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

export const ATTACHMENT_KINDS = ['condition_photo', 'data_list', 'handover_note', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * A file attached to a lot (condition photo, data list, handover note…).
 *
 * Stores the storage key, never the bytes — S3/MinIO key or UNC path. Masters are
 * never served through the app; browsers get derivatives only.
 */
const attachmentSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true, index: true },
    kind: { type: String, required: true, enum: ATTACHMENT_KINDS },
    fileName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    storageKey: { type: String, required: true, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'attachments' },
);

export type AttachmentDoc = InferSchemaType<typeof attachmentSchema>;

export const Attachment: Model<AttachmentDoc> =
  (models.Attachment as Model<AttachmentDoc>) ??
  model<AttachmentDoc>('Attachment', attachmentSchema);
