import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { MAX_OPEN_TODOS } from '@/lib/todo';
import { PersonalTodo } from '@/models/PersonalTodo';
import { Task } from '@/models/Task';
import { assertRealDay } from '@/server/tasks/mutations';
import { shapeTodo } from '@/server/todos/queries';
import type { Todo, TodoCreateBody, TodoPatchBody } from '@/types/todo';

/**
 * Personal to-do writes. Private by construction: every filter carries `owner`, so a foreign id
 * is a plain 404. No ActivityLog (a private list needs no audit trail).
 */

const ownerOf = (ctx: MutationContext) => new Types.ObjectId(ctx.userId);

function assertTodoId(id: string): void {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'To-do not found.');
}

async function assertRoom(owner: Types.ObjectId): Promise<void> {
  const open = await PersonalTodo.countDocuments({ owner, done: false });
  if (open >= MAX_OPEN_TODOS) {
    throw new HttpError(400, `You already have ${MAX_OPEN_TODOS} open to-dos. Finish or delete some first.`);
  }
}

export async function createTodo(body: TodoCreateBody, ctx: MutationContext): Promise<{ todo: Todo }> {
  await connectToDatabase();
  const owner = ownerOf(ctx);
  if (body.dueDate) assertRealDay(body.dueDate);
  await assertRoom(owner);
  const doc = await PersonalTodo.create({
    owner,
    title: body.title,
    note: body.note || null,
    urgent: body.urgent,
    important: body.important,
    dueDate: body.dueDate ?? null,
  });
  return { todo: shapeTodo(doc.toObject()) };
}

export async function updateTodo(todoId: string, body: TodoPatchBody, ctx: MutationContext): Promise<{ todo: Todo }> {
  await connectToDatabase();
  assertTodoId(todoId);
  const owner = ownerOf(ctx);
  const doc = await PersonalTodo.findOne({ _id: todoId, owner });
  if (!doc) throw new HttpError(404, 'To-do not found.');

  if (body.title !== undefined) doc.title = body.title;
  if (body.note !== undefined) doc.note = body.note || null;
  if (body.urgent !== undefined) doc.urgent = body.urgent;
  if (body.important !== undefined) doc.important = body.important;
  if (body.dueDate !== undefined) {
    if (body.dueDate) assertRealDay(body.dueDate);
    doc.dueDate = body.dueDate;
  }
  if (body.done !== undefined && body.done !== doc.done) {
    if (!body.done) await assertRoom(owner); // reopening counts against the cap
    doc.done = body.done;
    doc.doneAt = body.done ? new Date() : null;
  }
  if (body.delegatedTaskId !== undefined) {
    if (body.delegatedTaskId === null) {
      doc.delegatedTaskId = null;
      doc.delegatedTaskTitle = null;
    } else {
      // Only a task the caller created themselves can be linked (it is the one they just assigned).
      const task = await Task.findOne({ _id: body.delegatedTaskId, createdBy: owner }).select('title').lean();
      if (!task) throw new HttpError(400, 'That task was not found, or you did not assign it.');
      doc.delegatedTaskId = task._id as Types.ObjectId;
      doc.delegatedTaskTitle = task.title as string;
    }
  }
  await doc.save();
  return { todo: shapeTodo(doc.toObject()) };
}

export async function deleteTodo(todoId: string, ctx: MutationContext): Promise<{ ok: true }> {
  await connectToDatabase();
  assertTodoId(todoId);
  const res = await PersonalTodo.deleteOne({ _id: todoId, owner: ownerOf(ctx) });
  if (res.deletedCount === 0) throw new HttpError(404, 'To-do not found.');
  return { ok: true };
}
