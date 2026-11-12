import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { CHANGE_KINDS } from '@/lib/item-history';

/**
 * Version history of a lot's Excel: one document per save (see src/lib/item-history.ts and
 * src/server/lots/history.ts). The per-row before / after images live in `lotchangerows`; named
 * checkpoints in `lotversions`.
 */
const lotChangeSetSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true },
    /** 1, 2, 3 … per lot, from an atomic counter: the order of history. */
    seq: { type: Number, required: true },
    /** Edits by one person with under 30 minutes between them share a session. */
    sessionId: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    at: { type: Date, required: true },
    kind: { type: String, enum: CHANGE_KINDS, required: true },
    label: { type: String, required: true, maxlength: 300 },
    itemCount: { type: Number, required: true, default: 0 },
    cellCount: { type: Number, required: true, default: 0 },
    /** The lot-level state around the change (stage, decision …), so undo can reopen a decision exactly. */
    lotBefore: { type: Schema.Types.Mixed, default: null },
    lotAfter: { type: Schema.Types.Mixed, default: null },
    /** This change set is an undo / redo of these change sets. */
    undoOf: { type: [Schema.Types.ObjectId], default: [] },
    /** Set while an undo of this change set is in force. */
    undoneAt: { type: Date, default: null },
    undoneByName: { type: String, default: null },
    /** For an undo: can it still be redone? A new edit by the same person ends that. */
    redoable: { type: Boolean, default: true },
  },
  { timestamps: false, collection: 'lotchangesets' },
);
lotChangeSetSchema.index({ lot: 1, seq: -1 }, { unique: true });
lotChangeSetSchema.index({ lot: 1, sessionId: 1, seq: 1 });
lotChangeSetSchema.index({ lot: 1, actor: 1, seq: -1 });

export type LotChangeSetDoc = InferSchemaType<typeof lotChangeSetSchema>;
export const LotChangeSet: Model<LotChangeSetDoc> =
  (models.LotChangeSet as Model<LotChangeSetDoc> | undefined) ?? model<LotChangeSetDoc>('LotChangeSet', lotChangeSetSchema);

/** One item's before / after image inside a change set (null = the item did not exist / was removed). */
const lotChangeRowSchema = new Schema(
  {
    changeSet: { type: Schema.Types.ObjectId, ref: 'LotChangeSet', required: true, index: true },
    lot: { type: Schema.Types.ObjectId, required: true },
    seq: { type: Number, required: true },
    item: { type: Schema.Types.ObjectId, required: true },
    /** The item's code at the time (for the History list; the item's own code can change later). */
    code: { type: String, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    /** The field paths that differ (`place`, `decision.digital` …). */
    paths: { type: [String], default: [] },
  },
  { timestamps: false, collection: 'lotchangerows', minimize: false },
);
lotChangeRowSchema.index({ lot: 1, seq: 1 });
lotChangeRowSchema.index({ lot: 1, item: 1, seq: 1 });

export type LotChangeRowDoc = InferSchemaType<typeof lotChangeRowSchema>;
export const LotChangeRow: Model<LotChangeRowDoc> =
  (models.LotChangeRow as Model<LotChangeRowDoc> | undefined) ?? model<LotChangeRowDoc>('LotChangeRow', lotChangeRowSchema);

/** A named (or automatic) checkpoint: a pointer to a point in the lot's history. */
const lotVersionSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /** The sheet as it was after change set `seq` (0 = before any recorded change). */
    seq: { type: Number, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: null },
    /** Taken by the app (before an import, a restore …) rather than named by a person. */
    auto: { type: Boolean, default: false },
  },
  { timestamps: false, collection: 'lotversions' },
);
lotVersionSchema.index({ lot: 1, at: -1 });

export type LotVersionDoc = InferSchemaType<typeof lotVersionSchema>;
export const LotVersion: Model<LotVersionDoc> =
  (models.LotVersion as Model<LotVersionDoc> | undefined) ?? model<LotVersionDoc>('LotVersion', lotVersionSchema);
