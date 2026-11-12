import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { LOT_SOURCE_IDS, MASTER_COLUMN_KINDS } from '@/lib/master-custom';

/**
 * A custom column of the Master Excel, shared by everyone (see src/lib/master-custom.ts).
 * Free-text values live on the items (`LotItem.masterCustom[key]`); a fetched column stores only
 * which lot detail it reads.
 */
const masterColumnSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: MASTER_COLUMN_KINDS, required: true },
    source: { type: String, enum: [...LOT_SOURCE_IDS, null], default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: null },
  },
  { timestamps: true },
);

export type MasterColumnDoc = InferSchemaType<typeof masterColumnSchema>;

export const MasterColumn: Model<MasterColumnDoc> =
  (models.MasterColumn as Model<MasterColumnDoc> | undefined) ?? model<MasterColumnDoc>('MasterColumn', masterColumnSchema);
