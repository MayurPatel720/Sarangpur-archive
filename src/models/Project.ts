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
 * - A project has no lifecycle status — it is a pure grouping label. Dates and
 *   team are informational only and confer no access control: anyone holding
 *   `lot:view` sees every project.
 */
const projectTeamSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Free-text role on this project, e.g. "scanner", "tagger". */
    label: { type: String, trim: true, default: null },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    /** Admin-typed unique code, e.g. `DIWALI-2026`. Uniqueness enforced, format free. */
    code: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coordinator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    coordinatorName: { type: String, trim: true, default: null },
    team: { type: [projectTeamSchema], default: [] },

    startDate: { type: Date, default: null },
    targetDate: { type: Date, default: null },

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
