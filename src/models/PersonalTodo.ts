import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

/**
 * A personal to-do, private to its owner (never shown to anyone else, not part of the assigned
 * Tasks). Placed in an Eisenhower quadrant by two flags — `urgent` and `important`; the quadrant
 * itself is derived (src/lib/todo.ts), never stored. `delegatedTaskId` links the real assigned
 * Task created from the "Delegate" quadrant (title denormalised, never back-filled).
 * No activity log: nobody else needs an audit trail of someone's own list.
 */
const personalTodoSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    note: { type: String, trim: true, default: null, maxlength: 1000 },
    urgent: { type: Boolean, required: true, default: false },
    important: { type: Boolean, required: true, default: true },
    /** `YYYY-MM-DD` or null. */
    dueDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    done: { type: Boolean, required: true, default: false },
    doneAt: { type: Date, default: null },
    delegatedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    delegatedTaskTitle: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: 'personaltodos' },
);

personalTodoSchema.index({ owner: 1, done: 1, createdAt: -1 }); // my open / done list

export type PersonalTodoDoc = InferSchemaType<typeof personalTodoSchema>;

export const PersonalTodo: Model<PersonalTodoDoc> =
  (models.PersonalTodo as Model<PersonalTodoDoc>) ?? model<PersonalTodoDoc>('PersonalTodo', personalTodoSchema);
