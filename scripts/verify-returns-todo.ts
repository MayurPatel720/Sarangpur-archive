/**
 * Integration check: Physical+Digital items start with Digital = Yes, private to-dos,
 * comment-image rules, and the Returns handover flow (whole lot + single items).
 *
 *   npm run verify:returns-todo
 *
 * Runs the real server functions against the configured (seeded) database and removes
 * what it creates. Needs `npm run seed` first.
 */
import './load-env';

import { Types } from 'mongoose';
import { connectToDatabase } from '../src/lib/mongo';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { ActivityLog } from '../src/models/ActivityLog';
import { LotItem } from '../src/models/LotItem';
import { Task } from '../src/models/Task';
import { User } from '../src/models/User';
import type { MutationContext } from '../src/lib/api';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { addTaskComment, createPersonalTask, deletePersonalTask, updatePersonalTask } from '../src/server/tasks/mutations';
import { getTaskDetail, listTasks } from '../src/server/tasks/queries';
import { listReturns } from '../src/server/returns/board';
import { recordReturn } from '../src/server/returns/record';
import { returnRecordBodySchema } from '../src/types/returns';
import { taskCommentBodySchema } from '../src/types/task';

let failures = 0;
const check = (label: string, ok: boolean, extra?: unknown) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
};
async function rejects(label: string, fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch (e) {
    check(label, (e as { status?: number }).status === status, `${(e as { status?: number }).status}: ${(e as Error).message}`);
  }
}

async function main() {
  await connectToDatabase();
  const users = await User.find({}).select('name').limit(2).lean();
  if (users.length < 2) throw new Error('Run `npm run seed` first.');
  const [u1, u2] = users as [typeof users[0], typeof users[0]];
  const ctx = (u: typeof u1): MutationContext => ({ userId: String(u._id), userName: u.name as string, roleKey: 'admin', grants: [...ALL_PERMISSIONS] });
  const me = ctx(u1);
  const other = ctx(u2);
  const sample = await ArchiveLot.findOne({ format: 'video', originSource: { $ne: null } }).select('originSource').lean();
  const origin = sample!.originSource!;
  const madeLots: string[] = [];
  const madeTasks: string[] = [];

  try {
    console.log('\nPhysical + Digital → Digital = Yes');
    const lot = await createIntake(
      {
        dateReceived: new Date().toISOString(),
        originSource: origin,
        owner: { name: 'Receiver Test Owner', phone: '+91 9000000000' },
        pointsOfContact: [],
        mediaLines: [
          { format: 'video', dataType: 'both', mediaSubtype: 'DVD', quantity: 2 },
          { format: 'video', dataType: 'physical', mediaSubtype: 'VHS', quantity: 2 },
        ],
      },
      me,
    );
    madeLots.push(lot.id);
    const items = await LotItem.find({ lot: lot.id }).sort({ lineIndex: 1, sortOrder: 1 }).lean();
    const dig = items.map((i) => (i.decision as { digital?: boolean | null } | undefined)?.digital ?? null);
    check('Physical+Digital items start Yes, physical ones blank', dig.join() === 'true,true,,' || (dig[0] === true && dig[1] === true && dig[2] == null && dig[3] == null), dig);

    console.log('\nMy to-do (private)');
    const todo = await createPersonalTask({ title: 'Call the Delhi office', priority: 'urgent', dueDate: '2099-01-02', checklist: [] }, me);
    madeTasks.push(todo.task.id);
    check('created as personal, urgent, with a due date', todo.task.personal && todo.task.priority === 'urgent' && todo.task.dueDate === '2099-01-02', todo.task);
    check('the owner can edit it', todo.can.edit);
    const mine = await listTasks({ page: 1, pageSize: 100, assignee: 'me' }, me);
    check('shows in my list', mine.rows.some((r) => r.id === todo.task.id));
    const theirs = await listTasks({ page: 1, pageSize: 100 }, other);
    check('invisible to another admin in lists', !theirs.rows.some((r) => r.id === todo.task.id));
    await rejects('invisible in detail too (404)', () => getTaskDetail(todo.task.id, other), 404);
    const edited = await updatePersonalTask(todo.task.id, { priority: 'low', dueDate: null }, me);
    check('importance + due date editable', edited.task.priority === 'low' && edited.task.dueDate === null);
    await rejects('someone else cannot edit it', () => updatePersonalTask(todo.task.id, { title: 'hijack' }, other), 403);

    console.log('\nComment images');
    check('a comment needs text or an image', !taskCommentBodySchema.safeParse({ text: '', attachments: [] }).success);
    const forged = {
      url: 'https://evil.example/x.jpg',
      publicId: 'archive-tracker/tasks/other/x',
      fileName: 'x.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 10,
      width: null,
      height: null,
    };
    await rejects('a forged attachment is refused', () => addTaskComment(todo.task.id, { text: 'hi', attachments: [forged] }, me), 400);
    const good = {
      url: `https://res.cloudinary.com/demo/image/upload/archive-tracker/tasks/${todo.task.id}/a.jpg`,
      publicId: `archive-tracker/tasks/${todo.task.id}/a`,
      fileName: 'a.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      width: 800,
      height: 600,
    };
    const withImg = await addTaskComment(todo.task.id, { text: '', attachments: [good] }, me);
    check('an image-only comment is stored with its picture', withImg.task.comments[0]?.attachments.length === 1 && withImg.task.comments[0]?.text === '');

    console.log('\nReturns');
    const body = (over: object) => ({
      lotId: lot.id,
      scope: 'lot' as const,
      recipient: { name: 'Shri R. Shah', phone: '+91 98765 43210', email: '', place: 'Nairobi' },
      method: 'In person',
      ...over,
    });
    check('no phone and no email is rejected', !returnRecordBodySchema.safeParse(body({ recipient: { name: 'X' } })).success);
    check('post/courier without an address is rejected', !returnRecordBodySchema.safeParse(body({ method: 'Courier', recipient: { name: 'X', phone: '+91 98765 43210' } })).success);
    check('a good handover passes', returnRecordBodySchema.safeParse(body({})).success);

    // Make two of this lot's items pending returns, then hand one over.
    const [i1, i2] = items.slice(2) as [typeof items[0], typeof items[0]];
    await LotItem.updateMany(
      { _id: { $in: [i1._id, i2._id] } },
      { $set: { 'decision.disposition': 'return', dispositionStatus: 'pending', 'decision.digital': false, 'decision.redigital': false } },
    );
    await ArchiveLot.updateOne({ _id: lot.id }, { $set: { stage: 'metadata' } });
    const board = await listReturns({ tab: 'todo', page: 1, pageSize: 100 }, me);
    const card = board.cards.find((c) => c.lotId === lot.id);
    check('item returns show as one card for the lot', Boolean(card) && card!.items.length === 2 && !card!.wholeLot, card);
    check('the card carries the lot contacts', (card?.contacts.length ?? 0) >= 1);
    await rejects('items from another lot are refused', () => recordReturn({ ...body({}), scope: 'items', itemIds: [String(new Types.ObjectId())] }, me), 409);
    const r1 = await recordReturn({ ...body({}), scope: 'items', itemIds: [String(i1._id)] }, me);
    check('one item handed over, lot not finished', r1.returned === 1 && !r1.lotFinished, r1);
    const done = await listReturns({ tab: 'done', page: 1, pageSize: 100 }, me);
    const row = done.returned.find((r) => r.lotId === lot.id);
    check('history shows who received it', row?.recipient?.name === 'Shri R. Shah' && row?.recipient?.place === 'Nairobi' && row?.method === 'In person', row);
  } finally {
    await LotItem.deleteMany({ lot: { $in: madeLots } });
    await ActivityLog.deleteMany({ $or: [{ lot: { $in: madeLots } }, { task: { $in: madeTasks.map((t) => new Types.ObjectId(t)) } }] });
    await ArchiveLot.deleteMany({ _id: { $in: madeLots } });
    for (const t of madeTasks) await deletePersonalTask(t, me).catch(() => Task.deleteOne({ _id: t }));
  }
  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
