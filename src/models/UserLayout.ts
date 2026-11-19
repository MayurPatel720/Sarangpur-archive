import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * How one person likes a sheet laid out (column order, pins, widths, hidden columns, row height).
 * One document per person and sheet (`scope`: `items` for a lot's Items sheet, `master:<format>` for the
 * Master Excel). It follows the person to any computer; nobody else sees it.
 */
const userLayoutSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, required: true, trim: true, maxlength: 40 },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
userLayoutSchema.index({ user: 1, scope: 1 }, { unique: true });

export type UserLayoutDoc = InferSchemaType<typeof userLayoutSchema>;

export const UserLayout: Model<UserLayoutDoc> =
  (models.UserLayout as Model<UserLayoutDoc> | undefined) ?? model<UserLayoutDoc>('UserLayout', userLayoutSchema);
