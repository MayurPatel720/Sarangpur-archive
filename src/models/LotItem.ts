import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * One individual photograph, frame, tape or cassette inside a lot — the thing that
 * carries a code like NEG-MUM-014-01-03 and eventually one file on the server.
 *
 * Kept in its own collection rather than embedded in the lot: a lot can hold several
 * thousand of these, the reconciler updates them individually, and archive-wide
 * questions ("how many items are still untagged") need an index across all lots.
 *
 * `notDigitizedReason` values come from the admin-managed `notDigitizedReason`
 * reference list — deliberately not a Mongoose enum (open vocabulary).
 */
const lotItemSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true, index: true },
    /** Full item code, e.g. NEG-MUM-014-01-03. Unique across the archive. */
    code: { type: String, required: true, unique: true, trim: true },
    /** Group within the lot — a film roll, a tape, an album. */
    groupNo: { type: Number, required: true, min: 1 },
    itemNo: { type: Number, required: true, min: 1 },

    /** False for items the volunteers excluded at intake. */
    selectedForDigitization: { type: Boolean, required: true, default: true, index: true },
    notDigitizedReason: { type: String, default: null, index: true },

    digitized: { type: Boolean, required: true, default: false, index: true },
    fileName: { type: String, trim: true, default: null },
    fileBytes: { type: Number, default: 0, min: 0 },
    sha256: { type: String, trim: true, default: null },

    taggedInMls: { type: Boolean, required: true, default: false, index: true },
    mlsDuplicate: { type: Boolean, required: true, default: false, index: true },
    mlsDuplicateOf: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: 'lotitems' },
);

lotItemSchema.index({ lot: 1, groupNo: 1, itemNo: 1 });
lotItemSchema.index({ lot: 1, digitized: 1 }); // per-lot scan progress
lotItemSchema.index({ selectedForDigitization: 1, notDigitizedReason: 1 }); // exclusion report

export type LotItemDoc = InferSchemaType<typeof lotItemSchema>;

export const LotItem: Model<LotItemDoc> =
  (models.LotItem as Model<LotItemDoc>) ?? model<LotItemDoc>('LotItem', lotItemSchema);
