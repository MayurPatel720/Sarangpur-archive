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
    /** Media format of the item's line (photo / video / …) — denormalised so the Master Excel can filter without joining. */
    format: { type: String, trim: true, default: null, index: true },
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
    /** Where the digital copy came from, e.g. "Mumbai". Free text. */
    digitalSource: { type: String, trim: true, default: null },

    /*
     * Excel columns (the lot's Items tab). Departments: Details · Decision ·
     * Digitalization & Storage · Logging. `name`, `description`, `event`, `people`, `year`,
     * `month` and `itemCondition` are no longer shown or written (old data is kept).
     */
    /** Position in the lot's Excel; the user can drag rows. Display only — codes never change with it. */
    sortOrder: { type: Number, default: 0 },
    senderCode: { type: String, trim: true, default: null },
    /** The Date column is a range; a single day has dateFrom === dateTo. Calendar days at UTC midnight. */
    dateFrom: { type: Date, default: null },
    dateTo: { type: Date, default: null },
    nameOnTape: { type: String, trim: true, default: null },
    /** Code of the ORIGINAL this item duplicates (any lot). Set together with the D-kind recode. */
    duplicateCode: { type: String, trim: true, default: null, index: true },
    /** Where the physical item is kept. */
    phyStorageLoc: { type: String, trim: true, default: null },
    /** Digitalization & Storage remark. */
    storageRemark: { type: String, trim: true, default: null },
    /** Logging department: the row has been logged (signed off), when, and by whom. */
    logged: { type: Boolean, default: false },
    loggedAt: { type: Date, default: null },
    loggerName: { type: String, trim: true, default: null },
    /** User-added columns of the lot's Excel, keyed by the column's key (lot.customColumns). */
    custom: { type: Schema.Types.Mixed, default: undefined },

    /**
     * Per-item decision. Answers are Yes / No / unanswered (null). `verdict` is
     * computed by the server with the same rule as the lot checklist
     * (decision-rule.ts); `disposition` is chosen only when the verdict is
     * return_or_discard. The drop reason reuses `notDigitizedReason`.
     */
    decision: {
      /** Excel Decision columns. An item is decided once all three are answered. */
      digital: { type: Boolean, default: null },
      redigital: { type: Boolean, default: null },
      discard: { type: Boolean, default: null },
      remark: { type: String, trim: true, default: null },
      /* Legacy checklist answers (pre-Excel); kept for old records, no longer written. */
      existsInMls: { type: Boolean, default: null },
      newCopyIsBetter: { type: Boolean, default: null },
      conditionUsable: { type: Boolean, default: null },
      significant: { type: Boolean, default: null },
      verdict: { type: String, enum: ['archive', 'return_or_discard', null], default: null },
      /** The physical item's final fate (Excel "return/discard"); drives the Returns / Discards queues. */
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
    /**
     * How a returned item was handed over. Items returned in one handover share `batchId`,
     * so the Returned history shows them as one row.
     */
    returnInfo: {
      batchId: { type: String, default: null, index: true },
      recipientName: { type: String, trim: true, default: null },
      recipientEmail: { type: String, trim: true, default: null },
      recipientPhone: { type: String, trim: true, default: null },
      recipientPlace: { type: String, trim: true, default: null },
      method: { type: String, trim: true, default: null },
      trackingReference: { type: String, trim: true, default: null },
      notes: { type: String, trim: true, default: null },
    },
    /** Denormalised at finalise time for the item return/discard queues (no $lookup). */
    lotReference: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: 'lotitems' },
);

lotItemSchema.index({ lot: 1, groupNo: 1, itemNo: 1 });
lotItemSchema.index({ lot: 1, lineIndex: 1, sortOrder: 1 }); // Excel row order per sheet
lotItemSchema.index({ lot: 1, lineIndex: 1 }); // per-media-type progress
lotItemSchema.index({ lot: 1, digitized: 1 }); // per-lot scan progress
lotItemSchema.index({ selectedForDigitization: 1, notDigitizedReason: 1 }); // exclusion report
lotItemSchema.index({ 'decision.disposition': 1, dispositionStatus: 1 }); // item return/discard queues

export type LotItemDoc = InferSchemaType<typeof lotItemSchema>;

export const LotItem: Model<LotItemDoc> =
  (models.LotItem as Model<LotItemDoc>) ?? model<LotItemDoc>('LotItem', lotItemSchema);
