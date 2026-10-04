import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * A project: an admin-curated parent grouping lots together.
 *
 * Modelling notes:
 *
 * - Membership is stored on the LOT (`ArchiveLot.projectIds`), not here. The
 *   project page lists lots with a paginated `find({ projectIds })`, and the
 *   lot page reads its projects with a second indexed find — no `$lookup` on
 *   either read path (repo rule 4). `lotCount` below is a counter cache for the
 *   list page / dashboard widget, maintained inside the same transaction that
 *   mutates membership.
 *
 * - `coordinatorName` is denormalised at write time and never back-filled,
 *   same contract as `ActivityLog.actorName` (repo rule 5).
 *
 * - A project has no lifecycle status. Dates are informational only. The team is
 *   derived from the assignees of its lots (no manual list).
 */
const projectSchema = new Schema(
  {
    /** Admin-typed unique code, e.g. `DIWALI-2026`. Uniqueness enforced, format free. */
    code: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    coordinatorName: { type: String, trim: true, default: null },
    /**
     * Intake data shared by every synced child lot (one value for the whole
     * project). Plain object in the wire shape of `projectSharedSchema` — see `src/server/projects/sync.ts`
     * for the key list and the mapping. Dates are ISO strings (wire shape).
     */
    shared: { type: Schema.Types.Mixed, default: () => ({}) },


    /** Counter cache: lots currently carrying this project's id. See note above. */
    lotCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'projects' },
);

projectSchema.index({ createdAt: -1 }); // project list, newest first
projectSchema.index({ name: 1 }); // project picker / search

export type ProjectDoc = InferSchemaType<typeof projectSchema>;

export const Project: Model<ProjectDoc> =
  (models.Project as Model<ProjectDoc>) ?? model<ProjectDoc>('Project', projectSchema);
