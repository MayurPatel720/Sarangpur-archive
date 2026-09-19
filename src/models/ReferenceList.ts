import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * An admin-manageable vocabulary: one document per dropdown/option set in the app.
 *
 * This is the Tier-2 vocabulary system. Anything that is purely a label set — media
 * sub-types, rights/consent types, future option sets nobody has thought of yet —
 * lives here and is edited in `/admin/lists` with zero code changes. System enums
 * that drive logic (stages, decisions, roles-as-hierarchy) stay in `domain.ts`.
 *
 * The meta-schema is what makes this future-proof: each list declares the extra
 * fields its items need (e.g. sub-types require a unique `codePrefix` for naming-code
 * generation), and the admin UI renders the item editor from it. New vocabularies
 * with new shapes need no development.
 *
 * History safety: values are deactivated, never hard-deleted while in use. Display
 * resolves the current label with fallback to the stored value, so old records keep
 * rendering even if their value is later retired.
 */
const metaFieldSchema = new Schema(
  {
    field: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['string', 'number', 'boolean'] },
    required: { type: Boolean, required: true, default: false },
    unique: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const listItemSchema = new Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    active: { type: Boolean, required: true, default: true },
    sortOrder: { type: Number, required: true, default: 0 },
    /** Denormalised count of records referencing this value. Maintained on write. */
    usageCount: { type: Number, required: true, default: 0, min: 0 },
    /** Extra fields declared by the list's metaSchema, e.g. `{ codePrefix: 'NEG' }`. */
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const referenceListSchema = new Schema(
  {
    /** Namespaced machine key, e.g. `mediaSubtype.photo`. Unique. */
    key: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    /** Sidebar group in the admin UI, e.g. `Media`, `Rights & Legal`. */
    group: { type: String, required: true, trim: true, default: 'Custom' },
    metaSchema: { type: [metaFieldSchema], default: [] },
    items: { type: [listItemSchema], default: [] },
    revision: { type: Number, required: true, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'referencelists' },
);

export type ReferenceListDoc = InferSchemaType<typeof referenceListSchema>;

export const ReferenceList: Model<ReferenceListDoc> =
  (models.ReferenceList as Model<ReferenceListDoc>) ??
  model<ReferenceListDoc>('ReferenceList', referenceListSchema);
