import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { OVERRIDE_STATUSES, STAGES } from '@/lib/domain';

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
    /** Admin-managed `originSource` list value — not a Mongoose enum (open vocabulary). */
    originSource: { type: String },

    /**
     * Required for standalone intake (enforced by the API); optional here because a
     * project child lot is created before the admin knows it. The intake gate
     * (`submitForDecision`) blocks leaving Intake while it is empty.
     */
    dateReceived: { type: Date, default: null, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    owner: { type: contactSchema, default: undefined },
    pointsOfContact: { type: [contactSchema], default: [] },
    facilitator: { type: contactSchema, default: null },
    /** Info-only: people who know about this media (call and ask). Old docs have none. */
    referencePeople: {
      type: [new Schema({ name: { type: String, required: true, trim: true }, phone: { type: String, required: true, trim: true } }, { _id: false })],
      default: [],
    },

    format: { type: String, required: true, index: true },
    dataType: { type: String, required: true },
    mediaSubtype: { type: String, required: true, trim: true },

    quantity: { type: Number, required: true, min: 0 },
    quantityToDigitize: { type: Number, required: true, min: 0, default: 0 },
    quantityAlreadyDigitized: { type: Number, required: true, min: 0, default: 0 },
    quantityRemarks: { type: String, trim: true },

    /**
     * Per-media-type breakdown (one row per format/sub-type combination from
     * the intake table). The top-level `format`/`dataType`/`mediaSubtype` hold
     * the FIRST line's values (the lot's primary media) and
     * `quantity`/`quantityToDigitize`/`quantityAlreadyDigitized` hold the
     * across-lines sums, so every existing pipeline and filter keeps working.
     * Single-line lots carry exactly one entry mirroring the top level.
     */
    mediaLines: {
      type: [
        new Schema(
          {
            format: { type: String, required: true },
            dataType: { type: String, required: true },
            mediaSubtype: { type: String, required: true, trim: true },
            quantity: { type: Number, required: true, min: 0 },
            quantityToDigitize: { type: Number, required: true, min: 0, default: 0 },
            quantityAlreadyDigitized: { type: Number, required: true, min: 0, default: 0 },
            notDigitizedReason: { type: String, trim: true, default: null },
            quantityRemarks: { type: String, trim: true, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    conditionNotes: { type: String, trim: true },
    conditionPhotoUrl: { type: String, trim: true },
    reasonForSending: { type: String, trim: true },
    senderRemarks: { type: String, trim: true },

    /** Photo content metadata from the brief's ArchiveItems table. */
    photoDate: { type: String, trim: true },
    photoLocation: { type: String, trim: true },
    photoEvent: { type: String, trim: true },
    peopleInPhoto: { type: String, trim: true },

    /** Naming & storage (brief §3.05). */
    digitalFilePath: { type: String, trim: true },
    physicalLabelApplied: { type: Boolean, default: false },
    containerLabelApplied: { type: Boolean, default: false },

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

    /**
     * Projects this lot belongs to (many-to-many — a lot can sit in several
     * projects, and lots without any entry are standalone). Membership is
     * mutated only by `project:assign` holders through the projects mutations,
     * which keep `Project.lotCount` in sync in the same transaction.
     */
    projectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
      default: [],
      index: true,
    },

    /**
     * The one project whose shared intake data this lot mirrors (set for lots made
     * by the project wizard, or attached with sync). `projectIds` stays the
     * many-to-many membership list.
     */
    syncProjectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    /**
     * Who owns this lot end to end. Only the assignee and `project:assign` holders
     * may mutate it (enforced centrally in withAudit). `assigneeName` is denormalised
     * at write time and never back-filled (rule 5).
     */
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assigneeName: { type: String, trim: true, default: null },

    decision: {
      status: { type: String, required: true, default: 'pending', index: true },
      /** Server-computed verdict (decision-rule.ts). Stored so the UI can show it. */
      verdict: { type: String, enum: ['archive', 'return_or_discard'], default: null },
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      decidedAt: { type: Date, default: null },
      existsInMls: { type: Boolean, default: null },
      conditionUsable: { type: Boolean, default: null },
      newCopyIsBetter: { type: Boolean, default: null },
      conditionIssue: { type: String, trim: true, default: null },
      mlsMatchPaths: { type: [String], default: [] },
      significanceFlags: {
        type: [Boolean],
        default: undefined,
        validate: {
          validator: (v: boolean[] | undefined) => v === undefined || v.length >= 1,
          message: 'significanceFlags must hold at least one answer',
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
      /** Admin-managed `scanStatus` list value — open vocabulary (assertActive on write). */
      scanStatus: { type: String, default: 'pending', index: true },
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
      /** Free-text tags applied per the Tagging Guidelines (brief §3.04). */
      tagsApplied: { type: String, trim: true, default: null },
      duplicatesFound: { type: Number, default: 0, min: 0, index: true },
      duplicateAction: { type: String, default: null },
      duplicateApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      dataListAttached: { type: Boolean, default: false },
      syncFailures: { type: Number, default: 0, min: 0 },
    },

    return: {
      requested: { type: Boolean, required: true, default: false, index: true },
      format: { type: String, default: 'none' },
      durationText: { type: String, trim: true },
      dueAt: { type: Date, default: null, index: true },
      status: { type: String, default: 'not_requested', index: true },
      returnedAt: { type: Date, default: null },
      method: { type: String, trim: true },
      handledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      trackingReference: { type: String, trim: true },
      notes: { type: String, trim: true },
    },

    discard: {
      reason: { type: String, default: null },
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
