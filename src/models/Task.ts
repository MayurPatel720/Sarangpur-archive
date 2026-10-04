import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { FORMATS, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/domain';

/**
 * A daily-work task: admin assigns, the assignee drives it to done.
 *
 * Modelling notes:
 *
 * - Everything the cards and tables show is denormalised at write time and never
 *   back-filled (repo rules 4 + 5): `assignees[].name`, `createdByName`, `lotCode`,
 *   `projectCode`, plus the `checklistTotal` / `checklistDone` / `commentCount`
 *   counters. A list read is one indexed find/aggregate with no `$lookup`.
 *
 * - `format` is required. A task linked to a lot inherits that lot's format on the
 *   server, so format dashboards never need to join to the lot.
 *
 * - `dueDate` is a calendar day `YYYY-MM-DD` (not a timestamp): "due today" must mean
 *   the same day for the admin and the assignee. ISO dates compare correctly as
 *   strings, which is what the overdue buckets in `server/tasks/pipelines.ts` use.
 *
 * - Comments and checklist items are embedded: both are small and bounded (200 /
 *   50), and the drawer always reads them with the task. The history is NOT embedded —
 *   it is the `ActivityLog` (rows with `task` set), written by `withTaskAudit()`.
 *
 * - Derived "lots assigned to you" rows in Today's tasks are NOT tasks. No document
 *   exists for them; they are read straight off `ArchiveLot.assignee`.
 */
const checklistItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    done: { type: Boolean, required: true, default: false },
  },
  { _id: true },
);

const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    at: { type: Date, required: true },
  },
  { _id: true },
);

/** One person on the task. `id` is the User _id; `name` is denormalised and never back-filled. */
const assigneeSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false, id: false },
);

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: null },

    format: { type: String, required: true, enum: FORMATS },
    status: { type: String, required: true, enum: TASK_STATUSES, default: 'todo' },
    /** Required whenever status is `blocked`; cleared when it leaves `blocked`. */
    blockedReason: { type: String, trim: true, default: null },
    priority: { type: String, required: true, enum: TASK_PRIORITIES, default: 'normal' },
    /** `YYYY-MM-DD` or null (no due date). */
    dueDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },

    /** 1+ people. Status and checklist are shared: one status for the whole task. */
    assignees: { type: [assigneeSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true, trim: true },

    /** Optional links, stored with their codes so cards render without a lookup. */
    lot: { type: Schema.Types.ObjectId, ref: 'ArchiveLot', default: null },
    lotCode: { type: String, trim: true, default: null },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    projectCode: { type: String, trim: true, default: null },

    checklist: { type: [checklistItemSchema], default: [] },
    /** Counter caches for the card progress bar; kept in step by the mutations. */
    checklistTotal: { type: Number, required: true, default: 0, min: 0 },
    checklistDone: { type: Number, required: true, default: 0, min: 0 },

    comments: { type: [commentSchema], default: [] },
    commentCount: { type: Number, required: true, default: 0, min: 0 },

    doneAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'tasks' },
);

taskSchema.index({ 'assignees.id': 1, status: 1, dueDate: 1 }); // "tasks where I am an assignee" (multikey) + per-person counts
taskSchema.index({ createdBy: 1, status: 1, dueDate: 1 }); // tasks I assigned
taskSchema.index({ format: 1, status: 1, dueDate: 1 }); // format dashboards / admin view
taskSchema.index({ status: 1, doneAt: -1 }); // "done recently"
taskSchema.index({ lot: 1 }); // lot → tasks
taskSchema.index({ project: 1 }); // project → tasks

export type TaskDoc = InferSchemaType<typeof taskSchema>;

export const Task: Model<TaskDoc> =
  (models.Task as Model<TaskDoc>) ?? model<TaskDoc>('Task', taskSchema);
