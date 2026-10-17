import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { QUADRANTS, quadrantOf } from '@/lib/todo';
import { PersonalTodo, type PersonalTodoDoc } from '@/models/PersonalTodo';
import type { Todo, TodoListQuery, TodoListResponse } from '@/types/todo';

/** Personal to-dos: every query starts from `owner = the caller` — nobody else's list is reachable. */

export function shapeTodo(d: PersonalTodoDoc & { _id: unknown; createdAt?: Date }): Todo {
  return {
    id: String(d._id),
    title: d.title,
    note: d.note ?? null,
    urgent: d.urgent,
    important: d.important,
    quadrant: quadrantOf(d.urgent, d.important),
    dueDate: d.dueDate ?? null,
    done: d.done,
    doneAt: d.doneAt ? new Date(d.doneAt).toISOString() : null,
    delegatedTaskId: d.delegatedTaskId ? String(d.delegatedTaskId) : null,
    delegatedTaskTitle: d.delegatedTaskTitle ?? null,
    createdAt: (d.createdAt ?? new Date(0)).toISOString(),
  };
}

/** Mongo filter for one quadrant's two flags. */
const quadrantFilter = (id: string) => {
  const q = QUADRANTS.find((x) => x.id === id)!;
  return { urgent: q.urgent, important: q.important };
};

export async function listTodos(query: TodoListQuery, ctx: MutationContext): Promise<TodoListResponse> {
  await connectToDatabase();
  const owner = new Types.ObjectId(ctx.userId);
  const filter: Record<string, unknown> = { owner };
  if (query.status !== 'all') filter.done = query.status === 'done';
  if (query.quadrant) Object.assign(filter, quadrantFilter(query.quadrant));

  const dir: 1 | -1 = query.dir === 'asc' ? 1 : -1;
  // Quadrant order is the matrix's reading order: Do, Schedule, Delegate, Delete.
  const sort: Record<string, 1 | -1> =
    query.sort === 'due'
      ? { dueDate: dir, createdAt: -1 }
      : query.sort === 'title'
        ? { title: dir }
        : query.sort === 'quadrant'
          ? { important: dir === 1 ? -1 : 1, urgent: dir === 1 ? -1 : 1, createdAt: -1 }
          : { createdAt: dir };

  const [docs, total, grouped] = await Promise.all([
    PersonalTodo.find(filter)
      .sort(sort)
      .collation({ locale: 'en', strength: 2 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    PersonalTodo.countDocuments(filter),
    PersonalTodo.aggregate<{ _id: { urgent: boolean; important: boolean }; n: number }>([
      { $match: { owner, done: false } },
      { $group: { _id: { urgent: '$urgent', important: '$important' }, n: { $sum: 1 } } },
    ]),
  ]);

  const counts = { do: 0, schedule: 0, delegate: 0, delete: 0 };
  for (const g of grouped) counts[quadrantOf(g._id.urgent, g._id.important)] += g.n;
  return {
    rows: docs.map(shapeTodo),
    total,
    page: query.page,
    pageSize: query.pageSize,
    counts,
    openTotal: counts.do + counts.schedule + counts.delegate + counts.delete,
  };
}
