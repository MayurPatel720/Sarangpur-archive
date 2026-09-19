import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    initials: { type: String, required: true, uppercase: true, maxlength: 3 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /**
     * Optional login email (username login always works too). Unique + sparse so
     * any number of users can have NO email, but two users can never share one —
     * required for unambiguous email login in `verifyCredentials()`.
     */
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    /**
     * Role key into the `roles` collection (e.g. `volunteer`). Deliberately NOT a
     * Mongoose enum: roles are admin-manageable data, validated against the Role
     * collection at the API layer. The four seeded keys mirror `ROLES` in domain.ts.
     */
    role: { type: String, required: true, trim: true, index: true },
    active: { type: Boolean, required: true, default: true },
    /**
     * bcrypt hash. Never selected by default and never returned from an API —
     * use `verifyCredentials()` in `src/lib/auth.ts` instead of reading this.
     */
    passwordHash: { type: String, trim: true, default: null, select: false },
  },
  { timestamps: true, collection: 'users' },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>('User', userSchema);
