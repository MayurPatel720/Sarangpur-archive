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
    /**
     * Position of this item's media line in the lot's `mediaLines` array
     * (0 for single-line lots and everything created before lines existed).
     * Lets the lot page break scan/tag progress down per media type.
     */
    lineIndex: { type: Number, required: true, min: 0, default: 0, index: true },

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

    /*
     * Item details, filled in by the lot's assignee in the Items grid. Only `name`
     * is required before an item may get a decision. `physicalSource` and
     * `itemCondition` are admin-managed reference lists (open vocabulary).
     */
    name: { type: String, trim: true, default: null },
    nameOnCase: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    year: { type: Number, default: null, min: 1800, max: 2200 },
    /** Free text: "07", "11/12", "08/09". */
    month: { type: String, trim: true, default: null },
    place: { type: String, trim: true, default: null },
    event: { type: String, trim: true, default: null },
    people: { type: String, trim: true, default: null },
    physicalSource: { type: String, trim: true, default: null },
    itemCondition: { type: String, trim: true, default: null },
    remarks: { type: String, trim: true, default: null },
    /** Filled by capture / reconcile, read-only in the grid. */
    digitalSource: { type: String, trim: true, default: null },

    /**
     * Per-item decision. Answers are Yes / No / unanswered (null). `verdict` is
     * computed by the server with the same rule as the lot checklist
     * (decision-rule.ts); `disposition` is chosen only when the verdict is
     * return_or_discard. The drop reason reuses `notDigitizedReason`.
     */
    decision: {
      existsInMls: { type: Boolean, default: null },
      newCopyIsBetter: { type: Boolean, default: null },
      conditionUsable: { type: Boolean, default: null },
      significant: { type: Boolean, default: null },
      verdict: { type: String, enum: ['archive', 'return_or_discard', null], default: null },
      disposition: { type: String, enum: ['return', 'discard', null], default: null },
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      decidedAt: { type: Date, default: null },
    },
    /**
     * Item-level return/discard handling for lots that were otherwise archived
     * ("split by item"): pending until someone in the Returns / Discards queue marks
     * it done. Null when the whole lot was returned or discarded (the lot-level
     * flow handles those).
     */
    dispositionStatus: { type: String, enum: ['pending', 'done', null], default: null },
    dispositionDoneAt: { type: Date, default: null },
    dispositionDoneByName: { type: String, trim: true, default: null },
    /** Denormalised at finalise time for the item return/discard queues (no $lookup). */
    lotReference: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: 'lotitems' },
);

lotItemSchema.index({ lot: 1, groupNo: 1, itemNo: 1 });
lotItemSchema.index({ lot: 1, lineIndex: 1 }); // per-media-type progress
lotItemSchema.index({ lot: 1, digitized: 1 }); // per-lot scan progress
lotItemSchema.index({ selectedForDigitization: 1, notDigitizedReason: 1 }); // exclusion report
lotItemSchema.index({ 'decision.disposition': 1, dispositionStatus: 1 }); // item return/discard queues

export type LotItemDoc = InferSchemaType<typeof lotItemSchema>;

export const LotItem: Model<LotItemDoc> =
  (models.LotItem as Model<LotItemDoc>) ?? model<LotItemDoc>('LotItem', lotItemSchema);
