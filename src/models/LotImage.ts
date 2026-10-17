import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * A photo of a lot's physical items (Prasadi, albums, tapes … as received), stored in
 * Cloudinary — the database holds metadata only. Same shape as `ProjectImage`, but owned by a
 * LOT so a standalone intake (no project) can have photos too. `uploadedByName` is denormalised
 * at write time and never back-filled (same contract as `ActivityLog.actorName`).
 */
const lotImageSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true },
    url: { type: String, required: true, trim: true },
    /** Cloudinary public_id: what destroy() needs to remove the asset. */
    publicId: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    caption: { type: String, trim: true, default: '' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByName: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'lotimages' },
);

lotImageSchema.index({ lot: 1, createdAt: -1 });

export type LotImageDoc = InferSchemaType<typeof lotImageSchema>;

export const LotImage: Model<LotImageDoc> =
  (models.LotImage as Model<LotImageDoc>) ?? model<LotImageDoc>('LotImage', lotImageSchema);
