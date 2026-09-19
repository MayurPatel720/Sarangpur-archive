import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * The reconciliation engine's source of truth. Lets reconciliation be a database
 * diff instead of a 50TB filesystem walk: the walker upserts rows, the differ
 * anti-joins `LotItem.selectedForDigitization` against them.
 *
 * `lot` is nullable until a filename parses to a known item code; `matchedItemCode`
 * null means "unrecognised filename". `mtime` drives incremental scans, and
 * `lastVerifiedAt` drives the rolling fixity re-check.
 */
const fileIndexSchema = new Schema(
  {
    /** Full UNC path. Unique — one row per file on disk. */
    path: { type: String, required: true, unique: true, trim: true },
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', default: null, index: true },
    matchedItemCode: { type: String, trim: true, default: null, index: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    mtime: { type: Date, required: true },
    /** Filled by `jobs/checksum.ts`; null until first checksummed. */
    sha256: { type: String, trim: true, default: null },
    lastVerifiedAt: { type: Date, default: null },
    seenAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'fileindexes' },
);

fileIndexSchema.index({ lot: 1, matchedItemCode: 1 }); // the anti-join
fileIndexSchema.index({ mtime: -1 }); // incremental scans
fileIndexSchema.index({ lastVerifiedAt: 1 }); // oldest-first fixity queue

export type FileIndexDoc = InferSchemaType<typeof fileIndexSchema>;

export const FileIndex: Model<FileIndexDoc> =
  (models.FileIndex as Model<FileIndexDoc>) ?? model<FileIndexDoc>('FileIndex', fileIndexSchema);
