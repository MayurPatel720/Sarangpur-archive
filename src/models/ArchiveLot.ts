import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import {
  DATA_TYPES,
  DECISIONS,
  DISCARD_REASONS,
  FORMATS,
  ORIGIN_SOURCES,
  OVERRIDE_STATUSES,
  RETURN_FORMATS,
  RETURN_STATUSES,
  SCAN_STATUSES,
  STAGES,
} from '@/lib/domain';

/**
 * A lot: one delivery of material from one owner.
 *
 * Modelling notes, since these are the decisions that matter in MongoDB:
 *
 *  - Contacts (owner, points of contact, facilitator) are EMBEDDED. They belong to
 *    exactly one lot, are always read with it, and are never queried on their own.
 *    That is the textbook case for embedding.
 *
 *  - Individual item profiles are NOT embedded — they live in the `lotitems`
 *    collection. A lot can carry several thousand items, they are updated one at a
 *    time by the scan reconciler, and the 16MB document ceiling would eventually be
 *    hit. Embedding them would also make "how many items are digitised across the
 *    whole archive" an unindexable scan.
 *
 *  - `stageEnteredAt` is denormalised onto the lot so the SLA alert queries
 *    ("pending decision beyond 5 days") are a single indexed range scan rather than a
 *    lookup into the activity log.
 *
 *  - User references are ObjectIds. MongoDB will NOT enforce that they point at a real
 *    user — see src/server/integrity.ts for the application-level checks that stand in
 *    for foreign keys.
 */

const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
  },
  { _id: false },
);

const archiveLotSchema = new Schema(
  {
    lotReference: { type: String, required: true, unique: true, trim: true },
    /** Naming code, issued after the archive decision. Absent until then. */
    namingCode: { type: String, trim: true, index: true, sparse: true },
    originSource: { type: String, enum: ORIGIN_SOURCES },

    dateReceived: { type: Date, required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    owner: { type: contactSchema, required: true },
    pointsOfContact: { type: [contactSchema], default: [] },
    facilitator: { type: contactSchema, default: null },

    format: { type: String, required: true, enum: FORMATS, index: true },
    dataType: { type: String, required: true, enum: DATA_TYPES },
    mediaSubtype: { type: String, required: true, trim: true },

    quantity: { type: Number, required: true, min: 0 },
    quantityToDigitize: { type: Number, required: true, min: 0, default: 0 },
    quantityAlreadyDigitized: { type: Number, required: true, min: 0, default: 0 },
    quantityRemarks: { type: String, trim: true },

    conditionNotes: { type: String, trim: true },
    conditionPhotoUrl: { type: String, trim: true },
    reasonForSending: { type: String, trim: true },
    senderRemarks: { type: String, trim: true },

    /**
     * Rights / consent (deed of gift). `type` is validated against the
     * `rightsType` reference list at the API layer — deliberately not a Mongoose
     * enum, because the vocabulary is admin-managed.
     */
    rights: {
      type: { type: String, trim: true, default: null },
      deedReference: { type: String, trim: true, default: null },
      notes: { type: String, trim: true, default: null },
    },

    stage: { type: String, required: true, enum: STAGES, index: true },
    /** When the lot entered its current stage. Drives every "stuck for N days" alert. */
    stageEnteredAt: { type: Date, required: true, index: true },

    decision: {
      status: { type: String, required: true, enum: DECISIONS, default: 'pending', index: true },
      /** Server-computed verdict (decision-rule.ts). Stored so the UI can show it. */
      verdict: { type: String, enum: ['archive', 'return_or_discard'], default: null },
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      decidedAt: { type: Date, default: null },
      existsInMls: { type: Boolean, default: null },
      mlsMatchPaths: { type: [String], default: [] },
      conditionUsable: { type: Boolean, default: null },
      /** The four significance questions, in brief order. */
      significanceFlags: {
        type: [Boolean],
        default: undefined,
        validate: {
          validator: (v: boolean[] | undefined) => v === undefined || v.length === 4,
          message: 'significanceFlags must hold exactly four answers',
        },
      },
      significanceNotes: { type: String, trim: true },
      overrideStatus: {
        type: String,
        enum: OVERRIDE_STATUSES,
        default: 'none',
        index: true,
      },
      overrideRequestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      overrideApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },

    digitization: {
      scanStatus: { type: String, enum: SCAN_STATUSES, default: 'pending', index: true },
      scannedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      scanDate: { type: Date, default: null },
      folderPath: { type: String, trim: true, default: null },
      /** Counters maintained by the reconciler so the queue does not re-count items. */
      expectedFileCount: { type: Number, default: 0, min: 0 },
      foundFileCount: { type: Number, default: 0, min: 0 },
      lastReconciledAt: { type: Date, default: null },
      masterBytes: { type: Number, default: 0, min: 0 },
    },

    mls: {
      recordId: { type: String, trim: true, default: null },
      taggedCount: { type: Number, default: 0, min: 0 },
      duplicatesFound: { type: Number, default: 0, min: 0, index: true },
      duplicateAction: { type: String, enum: ['retained', 'removed', 'merged', null], default: null },
      duplicateApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      dataListAttached: { type: Boolean, default: false },
      syncFailures: { type: Number, default: 0, min: 0 },
    },

    return: {
      requested: { type: Boolean, required: true, default: false, index: true },
      format: { type: String, enum: RETURN_FORMATS, default: 'none' },
      durationText: { type: String, trim: true },
      dueAt: { type: Date, default: null, index: true },
      status: { type: String, enum: RETURN_STATUSES, default: 'not_requested', index: true },
      returnedAt: { type: Date, default: null },
      method: { type: String, trim: true },
      handledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      trackingReference: { type: String, trim: true },
      notes: { type: String, trim: true },
    },

    discard: {
      reason: { type: String, enum: DISCARD_REASONS, default: null },
      discardedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      discardedAt: { type: Date, default: null },
      notes: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
    collection: 'archivelots',
    // Every lot mutation flows through withAudit() with a caller-supplied __v, and
    // this makes the check airtight: save() itself compares __v and throws
    // VersionError on a race, and bumps __v on every successful write (without
    // this, scalar-only edits would leave __v frozen at 0 forever).
    optimisticConcurrency: true,
  },
);

// Compound indexes, each one backing a query the dashboard actually issues.
archiveLotSchema.index({ stage: 1, stageEnteredAt: 1 }); // SLA / stuck-in-stage alerts
archiveLotSchema.index({ dateReceived: -1, stage: 1 }); // register list, newest first
archiveLotSchema.index({ 'return.status': 1, 'return.dueAt': 1 }); // overdue returns
archiveLotSchema.index({ 'decision.overrideStatus': 1, stage: 1 }); // pending overrides

export type ArchiveLotDoc = InferSchemaType<typeof archiveLotSchema>;

export const ArchiveLot: Model<ArchiveLotDoc> =
  (models.ArchiveLot as Model<ArchiveLotDoc>) ??
  model<ArchiveLotDoc>('ArchiveLot', archiveLotSchema);
