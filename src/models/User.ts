import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { ROLES } from '@/lib/domain';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    initials: { type: String, required: true, uppercase: true, maxlength: 3 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    role: { type: String, required: true, enum: ROLES, index: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'users' },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>('User', userSchema);
