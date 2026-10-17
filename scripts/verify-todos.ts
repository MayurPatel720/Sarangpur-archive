/**
 * Personal to-dos (Eisenhower matrix): the quadrant rule, privacy between users, the 500-open cap,
 * completing / reopening, and linking a delegated task. Needs a seeded MongoDB.
 *
 *   npm run verify:todos
 */
import './load-env';

import { Types } from 'mongoose';
import { connectToDatabase } from '../src/lib/mongo';
import { PersonalTodo } from '../src/models/PersonalTodo';
import { Task } from '../src/models/Task';
import { User } from '../src/models/User';
import type { MutationContext } from '../src/lib/api';
import { MAX_OPEN_TODOS, QUADRANTS, flagsOf, quadrantOf, suggestUrgent } from '../src/lib/todo';
import { createTodo, deleteTodo, updateTodo } from '../src/server/todos/mutations';
import { listTodos } from '../src/server/todos/queries';
import { todoListQuerySchema } from '../src/types/todo';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}
async function rejects(label: string, fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch (e) {
    check(label, (e as { status?: number }).status === status, (e as Error).message);
  }
}

const q = (over: Record<string, unknown> = {}) => todoListQuerySchema.parse(over);
const ctxFor = (id: string, name: string): MutationContext => ({ userId: id, userName: name, roleKey: 'test', grants: ['task:view'] });

async function main() {
  console.log('quadrant rule');
  check('urgent + important = Do', quadrantOf(true, true) === 'do');
  check('not urgent + important = Schedule', quadrantOf(false, true) === 'schedule');
  check('urgent + not important = Delegate', quadrantOf(true, false) === 'delegate');
  check('neither = Delete', quadrantOf(false, false) === 'delete');
  check('flags round-trip through the quadrant', QUADRANTS.every((x) => quadrantOf(flagsOf(x.id).urgent, flagsOf(x.id).important) === x.id));
  check('due within two days suggests urgent', suggestUrgent('2026-10-19', '2026-10-17') === true && suggestUrgent('2026-10-20', '2026-10-17') === false);
  check('past due suggests urgent, no date does not', suggestUrgent('2026-10-01', '2026-10-17') === true && suggestUrgent(null, '2026-10-17') === false);

  await connectToDatabase();
  const u = await User.findOne({}).select('name').lean();
  if (!u) throw new Error('Run `npm run seed` first.');
  const A = ctxFor(String(u._id), u.name as string);
  const B = ctxFor(String(new Types.ObjectId()), 'Someone Else');
  const owners = [new Types.ObjectId(A.userId), new Types.ObjectId(B.userId)];
  await PersonalTodo.deleteMany({ owner: { $in: owners } });
  let taskId: Types.ObjectId | null = null;

  try {
    console.log('create and list');
    const a1 = (await createTodo({ title: 'File the Diwali returns', urgent: true, important: true, dueDate: '2030-01-05' }, A)).todo;
    const a2 = (await createTodo({ title: 'Plan the digitization roadmap', urgent: false, important: true }, A)).todo;
    await createTodo({ title: 'Reply to the vendor', urgent: true, important: false }, A);
    await createTodo({ title: 'Scroll the news', urgent: false, important: false }, A);
    check('quadrant is derived from the flags', a1.quadrant === 'do' && a2.quadrant === 'schedule', [a1.quadrant, a2.quadrant]);
    const all = await listTodos(q({ pageSize: 500 }), A);
    check('one open to-do in every quadrant', all.total === 4 && all.openTotal === 4 && Object.values(all.counts).every((n) => n === 1), all.counts);
    const doOnly = await listTodos(q({ quadrant: 'do' }), A);
    check('quadrant filter', doOnly.rows.length === 1 && doOnly.rows[0]!.title === 'File the Diwali returns');
    const byQuadrant = await listTodos(q({ sort: 'quadrant', dir: 'asc' }), A);
    check('sorted by quadrant: Do, Schedule, Delegate, Delete', byQuadrant.rows.map((r) => r.quadrant).join() === 'do,schedule,delegate,delete', byQuadrant.rows.map((r) => r.quadrant));
    const byTitle = await listTodos(q({ sort: 'title', dir: 'asc' }), A);
    check('sorted by title (case-insensitive)', byTitle.rows[0]!.title === 'File the Diwali returns', byTitle.rows.map((r) => r.title));
    const paged = await listTodos(q({ pageSize: 3, page: 2 }), A);
    check('paging', paged.rows.length === 1 && paged.total === 4, [paged.rows.length, paged.total]);
    await rejects('a bad due date is refused', () => createTodo({ title: 'x', urgent: false, important: false, dueDate: '2030-02-31' }, A), 400);

    console.log('moving and completing');
    const moved = (await updateTodo(a2.id, flagsOf('do'), A)).todo;
    check('moving to another quadrant changes the flags', moved.quadrant === 'do' && moved.urgent && moved.important);
    const done = (await updateTodo(a1.id, { done: true }, A)).todo;
    check('completing stamps the time and leaves the open list', done.done && Boolean(done.doneAt) && (await listTodos(q(), A)).total === 3);
    check('done list shows it', (await listTodos(q({ status: 'done' }), A)).rows.map((r) => r.id).join() === a1.id);
    const reopened = (await updateTodo(a1.id, { done: false }, A)).todo;
    check('reopening clears the time', !reopened.done && reopened.doneAt === null);
    const cleared = (await updateTodo(a1.id, { dueDate: null, note: null }, A)).todo;
    check('a due date can be cleared', cleared.dueDate === null && cleared.note === null);

    console.log('privacy');
    check('another user sees none of it', (await listTodos(q(), B)).total === 0);
    await rejects('another user cannot edit it', () => updateTodo(a1.id, { title: 'mine now' }, B), 404);
    await rejects('another user cannot delete it', () => deleteTodo(a1.id, B), 404);
    await rejects('a bad id is a 404', () => deleteTodo('nope', A), 404);
    check('the owner still has all four', (await listTodos(q(), A)).openTotal === 4);

    console.log('delegation');
    const t = await Task.create({ title: 'Reply to the vendor — assigned', format: 'photo', createdBy: owners[0], createdByName: A.userName, assignees: [{ id: owners[0], name: A.userName }] });
    taskId = t._id as Types.ObjectId;
    const delegateTodo = (await listTodos(q({ quadrant: 'delegate' }), A)).rows[0]!;
    const linked = (await updateTodo(delegateTodo.id, { delegatedTaskId: String(taskId) }, A)).todo;
    check('a delegated task I assigned links to the to-do', linked.delegatedTaskId === String(taskId) && linked.delegatedTaskTitle === 'Reply to the vendor — assigned', linked);
    await rejects('a task someone else created cannot be linked', () => updateTodo(delegateTodo.id, { delegatedTaskId: String(taskId) }, B), 404);
    const other = await Task.create({ title: 'Not mine', format: 'photo', createdBy: owners[1], createdByName: 'Someone Else', assignees: [{ id: owners[1], name: 'Someone Else' }] });
    await rejects('linking a task I did not create is refused', () => updateTodo(delegateTodo.id, { delegatedTaskId: String(other._id) }, A), 400);
    await Task.deleteOne({ _id: other._id });
    check('the link can be removed', (await updateTodo(delegateTodo.id, { delegatedTaskId: null }, A)).todo.delegatedTaskId === null);

    console.log('delete and the cap');
    await deleteTodo(a2.id, A);
    check('delete removes it', (await listTodos(q(), A)).openTotal === 3);
    await PersonalTodo.deleteMany({ owner: owners[0] });
    await PersonalTodo.insertMany(Array.from({ length: MAX_OPEN_TODOS }, (_, i) => ({ owner: owners[0], title: `bulk ${i}`, urgent: false, important: true })));
    await rejects(`the ${MAX_OPEN_TODOS + 1}th open to-do is refused`, () => createTodo({ title: 'one too many', urgent: false, important: true }, A), 400);
    const first = (await listTodos(q({ pageSize: 1 }), A)).rows[0]!;
    await updateTodo(first.id, { done: true }, A);
    check('finishing one frees a place', (await createTodo({ title: 'now it fits', urgent: false, important: true }, A)).todo.title === 'now it fits');
    await rejects('reopening past the cap is refused', () => updateTodo(first.id, { done: false }, A), 400);
    check('the matrix can load every open to-do in one page', (await listTodos(q({ pageSize: MAX_OPEN_TODOS }), A)).rows.length === MAX_OPEN_TODOS);
  } finally {
    await PersonalTodo.deleteMany({ owner: { $in: owners } });
    if (taskId) await Task.deleteOne({ _id: taskId });
  }
  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
