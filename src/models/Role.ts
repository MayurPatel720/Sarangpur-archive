import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * An admin-manageable role: a named set of permission grants.
 *
 * Permission KEYS are a contract owned by code (`src/server/permissions.ts`) — a route
 * checks `can(role, 'decision:record')`, so renaming a key would silently break the
 * check. But which keys each role holds is pure data, editable in `/admin/roles`
 * without a deploy. The four seeded system roles mirror the original role hierarchy
 * as grant sets; `rank` is display order only and never participates in access logic.
 *
 * Safety: the lockout invariants (at least one active role with user/role management
 * held by at least one active user) are enforced in the role/user mutation layer, not
 * here — the schema cannot see across collections.
 */
const roleChangeSchema = new Schema(
  {
    at: { type: Date, required: true },
    actorName: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const roleSchema = new Schema(
  {
    /** Stable machine key, e.g. `volunteer`. Referenced by User.role and the JWT. */
    key: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    /** Display order in the matrix UI. Never used for access decisions. */
    rank: { type: Number, required: true, default: 0 },
    /** Permission keys from the registry in `src/server/permissions.ts`. */
    permissions: { type: [String], default: [] },
    /** Seeded roles cannot be deleted, only edited. */
    isSystem: { type: Boolean, required: true, default: false },
    active: { type: Boolean, required: true, default: true, index: true },
    revision: { type: Number, required: true, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Last 50 changes; role edits are security-sensitive and worth tracing. */
    recentChanges: { type: [roleChangeSchema], default: [] },
  },
  { timestamps: true, collection: 'roles' },
);

export type RoleDoc = InferSchemaType<typeof roleSchema>;

export const Role: Model<RoleDoc> =
  (models.Role as Model<RoleDoc>) ?? model<RoleDoc>('Role', roleSchema);
