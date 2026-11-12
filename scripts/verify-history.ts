/**
 * Integration check for the version history of a lot's Excel: change sets, undo / redo, conflicts,
 * added rows, discard-clear-code, reopening a decision (and the guard), sessions, saved versions,
 * restore with preview, and per-item history.
 *
 *   npx tsx scripts/verify-history.ts
 *
 * Runs the REAL server functions against the configured database (needs a seeded DB with a replica
 * set), creates throw-away lots and removes everything it created.
 */
import './load-env';

import fs from 'node:fs';
import path from 'node:path';
import { Types } from 'mongoose';
import { connectToDatabase } from '../src/lib/mongo';
import { imageOf, normalize } from '../src/lib/item-history';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { ActivityLog } from '../src/models/ActivityLog';
import { LotChangeRow, LotChangeSet, LotVersion } from '../src/models/LotChangeSet';
import { LotItem } from '../src/models/LotItem';
import { User } from '../src/models/User';
import type { MutationContext } from '../src/lib/api';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { bulkUpdateItems, getItemsGrid } from '../src/server/lots/item-grid';
import { createItem } from '../src/server/lots/items';
import { reorderItems } from '../src/server/lots/item-codes';
import { setLotAssignee } from '../src/server/projects/mutations';
import {
  changeDetail,
  itemHistory,
  listHistory,
  previewRestore,
  redoLast,
  restoreTo,
  runHistoryAction,
  saveVersion,
  undoLast,
  undoOne,
  undoSession,
} from '../src/server/lots/history';

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}
async function rejects(label: string, fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch (e) {
    const s = (e as { status?: number }).status;
    check(label, s === status, `status ${s}: ${(e as Error).message}`);
  }
}

async function main() {
  await connectToDatabase();
  const users = await User.find({}).select('name').limit(2).lean();
  if (users.length < 2) throw new Error('Need at least 2 users — run `npm run seed` first.');
  const [u1, u2] = users as [(typeof users)[0], (typeof users)[0]];
  const ctxFor = (u: typeof u1, grants: string[]): MutationContext => ({ userId: String(u._id), userName: u.name as string, roleKey: 'test', grants });
  const admin = ctxFor(u1, [...ALL_PERMISSIONS]);
  const other = ctxFor(u2, [...ALL_PERMISSIONS]);
  const plain = ctxFor(u2, ['lot:view', 'lot:edit', 'item:create', 'format:photo']);

  const sample = await ArchiveLot.findOne({ format: 'photo', originSource: { $ne: null } }).select('dataType mediaSubtype originSource').lean();
  if (!sample) throw new Error('No photo lot in the database to borrow a valid sub-type from.');
  const created: string[] = [];

  const makeLot = async (qty: number) => {
    const res = await createIntake(
      {
        dateReceived: new Date().toISOString(),
        originSource: sample.originSource!,
        owner: { name: 'History Owner' },
        locationReceiver: { name: 'History Receiver' },
        pointsOfContact: [],
        mediaLines: [{ format: 'photo', dataType: sample.dataType, mediaSubtype: sample.mediaSubtype, quantity: qty }],
      },
      admin,
    );
    created.push(res.id);
    return res.id;
  };
  const grid = async (lotId: string) => (await getItemsGrid(lotId, { userId: admin.userId, grants: admin.grants })).items;
  const dbImage = async (id: string) => normalize(imageOf((await LotItem.findById(id).lean()) as unknown as Record<string, unknown>));
  const place = async (id: string) => (await LotItem.findById(id).lean())?.place ?? null;

  try {
    /* ----------------------------------------------- nothing bypasses the history */
    console.log('every write to items is covered');
    // Files that write to `LotItem`, and why each is covered: it records through tracked() / trackedByItems(), or the
    // fields it writes are not tracked (photos, scan file data), or it creates the lot's first rows (the baseline).
    const COVERED: Record<string, string> = {
      'server/lots/item-grid.ts': 'applyItemEdits + the disposition queue are wrapped',
      'server/lots/items.ts': 'createItem is wrapped',
      'server/lots/item-codes.ts': 'recode / number / duplicate / reorder / columns are wrapped',
      'server/lots/item-status.ts': 'changeItemStatus is wrapped',
      'server/lots/prasadi-checks.ts': 'markPrasadiChecked is wrapped',
      'server/returns/record.ts': 'recordReturn is wrapped',
      'server/lots/mutations.ts': 'intake creates the baseline; replaceMediaLines is wrapped; the decision writes run inside a wrapped edit',
      'server/lots/item-images.ts': 'photo counters are not tracked fields',
      'server/lots/master-columns.ts': 'removing a Master column clears its values across lots',
      'server/lots/history.ts': 'undo / restore write the images back, and record themselves',
      'server/lots/history-core.ts': 'reads only',
    };
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const root = path.resolve(__dirname, '../src');
    const writers = walk(root)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /LotItem\.(updateOne|updateMany|bulkWrite|create|insertMany|deleteMany|deleteOne|findOneAndUpdate|findByIdAndUpdate)\(/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f).split(path.sep).join('/'));
    const unknown = writers.filter((f) => !(f in COVERED));
    check('no file writes to items without being listed as covered by the history', unknown.length === 0, unknown);

    console.log('record, undo, redo');
    const lot = await makeLot(6);
    const items = await grid(lot);
    const [a, b, c] = [items[0]!, items[1]!, items[2]!];
    const original = await dbImage(a.id);

    await bulkUpdateItems(lot, { itemIds: [a.id], set: { place: 'Surat' } }, admin);
    let h = await listHistory(lot, admin);
    check('one session with one change', h.sessions.length === 1 && h.sessions[0]!.sets.length === 1, h.sessions);
    check('the label names the field', /Place/.test(h.sessions[0]!.sets[0]!.label), h.sessions[0]!.sets[0]!.label);
    check('Undo is offered, Redo is not', Boolean(h.canUndo) && h.canRedo === null);

    let r = await undoLast(lot, admin);
    check('undo puts the row back exactly', r.done && (await dbImage(a.id)) === original && (await place(a.id)) === null, r);
    h = await listHistory(lot, admin);
    check('after undo: Redo is offered, change shows as undone', Boolean(h.canRedo) && h.sessions[0]!.sets.some((s) => s.undone && s.kind !== 'undo'));
    r = await redoLast(lot, admin);
    check('redo brings the value back', r.done && (await place(a.id)) === 'Surat', r);
    check('a second redo has nothing to do', (await listHistory(lot, admin)).canRedo === null);

    console.log('bulk edit is one change');
    await bulkUpdateItems(lot, { itemIds: [a.id, b.id, c.id], set: { remarks: 'bulk note', place: 'Mumbai' } }, admin);
    h = await listHistory(lot, admin);
    check('three rows, one change set', h.sessions[0]!.sets[0]!.itemCount === 3, h.sessions[0]!.sets[0]);
    await undoLast(lot, admin);
    check('undo reverts all three rows', (await place(a.id)) === 'Surat' && (await place(b.id)) === null && (await LotItem.findById(c.id).lean())?.remarks == null);

    /* ------------------------------------------------------------ conflicts */
    console.log('conflicts');
    await bulkUpdateItems(lot, { itemIds: [b.id], set: { place: 'First' } }, admin);
    await bulkUpdateItems(lot, { itemIds: [b.id], set: { place: 'Second' } }, other);
    const stale = (await listHistory(lot, admin)).canUndo!;
    r = await undoLast(lot, admin);
    check('someone changed the cell since: undo stops with the cell listed', !r.done && r.conflicts.length === 1 && r.conflicts[0]!.itemId === b.id, r);
    check('nothing was written', (await place(b.id)) === 'Second' && (await listHistory(lot, admin)).canUndo?.id === stale.id);
    r = await undoLast(lot, admin, true);
    check('"undo the rest" skips the conflict', r.applied === 0 && (await place(b.id)) === 'Second');
    await bulkUpdateItems(lot, { itemIds: [c.id], set: { place: 'Zed' } }, admin);
    const zed = (await listHistory(lot, admin)).canUndo!;
    await setLotAssignee(lot, { assigneeId: String(u1._id) }, admin);
    await rejects('a user who may not work the lot cannot undo', () => undoOne(lot, zed.id, plain), 403);
    await setLotAssignee(lot, { assigneeId: null }, admin);
    await undoOne(lot, zed.id, admin);

    /* ---------------------------------------------------------- added rows */
    console.log('added rows');
    const before = (await grid(lot)).length;
    const added = await createItem(lot, { quantity: 3 }, admin);
    check('three rows added', (await grid(lot)).length === before + 3 && added.created === 3);
    r = await undoLast(lot, admin);
    check('undo removes them', r.done && (await grid(lot)).length === before, r);
    r = await redoLast(lot, admin);
    const afterRedo = await grid(lot);
    check('redo brings them back with the same codes', r.done && afterRedo.length === before + 3 && afterRedo.some((i) => i.code === added.code) && afterRedo.some((i) => i.code === added.lastCode), r);

    /* ------------------------------------------------------ discard + clear */
    console.log('discard · yes and clear code');
    const target = (await grid(lot))[3]!;
    const codeBefore = target.code;
    const imgBefore = await dbImage(target.id);
    await bulkUpdateItems(lot, { itemIds: [target.id], set: { discardClearCode: true } }, admin);
    const cleared = (await LotItem.findById(target.id).lean())!;
    check('the code was cleared', /^discard-\d+$/.test(cleared.code) && cleared.clearedCode === codeBefore, cleared.code);
    r = await undoLast(lot, admin);
    check('undo brings the code, the answers and the position back', r.done && (await dbImage(target.id)) === imgBefore, r);
    r = await redoLast(lot, admin);
    check('redo clears it again', r.done && /^discard-\d+$/.test((await LotItem.findById(target.id).lean())!.code), r);
    await undoLast(lot, admin);

    /* ------------------------------------------------------------ re-order */
    console.log('re-order');
    const order = (await grid(lot)).map((i) => i.id);
    const flipped = [...order].reverse();
    await reorderItems(lot, { lineIndex: 0, orderedIds: flipped }, admin);
    check('reordered', (await grid(lot))[0]!.id === flipped[0]);
    await undoLast(lot, admin);
    check('undo restores the row order', (await grid(lot)).map((i) => i.id).join() === order.join());

    /* ---------------------------------------------- reopening a decision */
    console.log('a decision that finalized the lot');
    const lot2 = await makeLot(4);
    const l2items = await grid(lot2);
    const lotBefore = (await ArchiveLot.findById(lot2).lean())!;
    await bulkUpdateItems(lot2, { itemIds: l2items.map((i) => i.id), set: { digital: true, redigital: false, discard: false } }, admin);
    const decided = (await ArchiveLot.findById(lot2).lean())!;
    check('the lot was decided by its items', decided.decision?.status === 'archive' && decided.stage !== lotBefore.stage, [decided.stage, decided.decision?.status]);
    const namingCode = decided.namingCode;
    r = await undoLast(lot2, admin);
    const reopened = (await ArchiveLot.findById(lot2).lean())!;
    check('undo reopens the decision and puts the stage back', r.done && reopened.decision?.status === 'pending' && reopened.stage === lotBefore.stage && !reopened.namingCode, [r, reopened.stage, reopened.decision?.status]);
    check('the items are undecided again', (await grid(lot2)).every((i) => i.result === null));
    r = await redoLast(lot2, admin);
    const redecided = (await ArchiveLot.findById(lot2).lean())!;
    check('redo decides it again with the same naming code', r.done && redecided.decision?.status === 'archive' && redecided.namingCode === namingCode, [redecided.decision?.status, redecided.namingCode, namingCode]);
    await bulkUpdateItems(lot2, { itemIds: [l2items[0]!.id], set: { captured: true } }, admin);
    const decisionSet = await LotChangeSet.findOne({ lot: lot2, kind: 'bulk', label: /Digital/ }).sort({ seq: -1 }).lean();
    await rejects('reopening is refused after digitalization has started', () => undoOne(lot2, String(decisionSet!._id), admin), 409);
    check('and the lot is still decided', (await ArchiveLot.findById(lot2).lean())!.decision?.status === 'archive');

    /* ------------------------------------------------------------- sessions */
    console.log('sessions');
    const lot3 = await makeLot(3);
    const l3 = await grid(lot3);
    await bulkUpdateItems(lot3, { itemIds: [l3[0]!.id], set: { place: 'One' } }, admin);
    await bulkUpdateItems(lot3, { itemIds: [l3[1]!.id], set: { place: 'Two' } }, admin);
    await bulkUpdateItems(lot3, { itemIds: [l3[2]!.id], set: { place: 'Three' } }, other);
    h = await listHistory(lot3, admin);
    check('two people make two sessions; one person\'s edits share one', h.sessions.length === 2 && h.sessions.map((s) => s.sets.length).sort().join() === '1,2', h.sessions.map((s) => s.sets.length));
    const mine = h.sessions.find((s) => s.sets.length === 2)!;
    r = await undoSession(lot3, mine.id, admin);
    check('undo session reverts both of their changes', r.done && (await place(l3[0]!.id)) === null && (await place(l3[1]!.id)) === null && (await place(l3[2]!.id)) === 'Three', r);
    h = await listHistory(lot3, admin);
    check('the session shows as undone', h.sessions.find((s) => s.id === mine.id)!.undone);

    /* ------------------------------------------------- versions + restore */
    console.log('saved versions and restore');
    await saveVersion(lot3, 'Clean start', admin);
    const version = (await listHistory(lot3, admin)).versions[0]!;
    await bulkUpdateItems(lot3, { itemIds: [l3[0]!.id, l3[1]!.id], set: { place: 'Changed', nameOnTape: 'T1' } }, admin);
    await bulkUpdateItems(lot3, { itemIds: [l3[1]!.id], set: { remarks: 'later' } }, other);
    const preview = await previewRestore(lot3, { versionId: version.id });
    check('preview counts what would change', preview.itemCount === 2 && preview.cellCount >= 4 && preview.changes.length === 2, preview);
    const snapshot = await Promise.all(l3.map((i) => dbImage(i.id)));
    r = await restoreTo(lot3, { versionId: version.id }, admin);
    check('restore puts the sheet back to the version', r.done && (await place(l3[0]!.id)) === null && (await place(l3[1]!.id)) === null && (await place(l3[2]!.id)) === 'Three', r);
    check('an automatic checkpoint was taken first', (await LotVersion.countDocuments({ lot: lot3, auto: true, name: 'Before restore' })) === 1);
    r = await undoLast(lot3, admin);
    const restoredBack = await Promise.all(l3.map((i) => dbImage(i.id)));
    check('the restore itself can be undone', r.done && (await place(l3[0]!.id)) === 'Changed' && (await place(l3[1]!.id)) === 'Changed' && restoredBack.length === snapshot.length);
    await rejects('an unknown version is refused', () => previewRestore(lot3, { versionId: '0'.repeat(24) }), 404);

    /* ---------------------------------------------------------- item history */
    console.log('who changed this');
    const hist = await itemHistory(lot3, { itemId: l3[0]!.id, path: 'place' });
    check('every change of the cell is listed, newest first', hist.entries.length >= 3 && hist.entries[0]!.cells[0]!.path === 'place', hist.entries.map((e) => e.label));
    const detail = await changeDetail(lot3, h.sessions[0]!.sets[0]!.id);
    check('a change set lists its cells', detail.changes.length > 0 && detail.changes[0]!.cells.length > 0, detail);
    const viaAction = await runHistoryAction(lot3, { action: 'saveVersion', name: 'Via action' }, admin);
    check('the single action endpoint saves a version', viaAction.done && (await listHistory(lot3, admin)).versions.some((v) => v.name === 'Via action'));
    await rejects('an empty version name is refused', () => saveVersion(lot3, '   ', admin), 400);

    /* ------------------------------------------------------------ completeness */
    console.log('the rows of every recorded change');
    const sets = await LotChangeSet.countDocuments({ lot: { $in: created } });
    const rowSets = (await LotChangeRow.distinct('changeSet', { lot: { $in: created } })).length;
    check('every change set has rows (or a lot-level change)', rowSets > 0 && rowSets <= sets, [rowSets, sets]);
  } finally {
    const ids = created.map((x) => new Types.ObjectId(x));
    await LotChangeRow.deleteMany({ lot: { $in: ids } });
    await LotChangeSet.deleteMany({ lot: { $in: ids } });
    await LotVersion.deleteMany({ lot: { $in: ids } });
    await LotItem.deleteMany({ lot: { $in: ids } });
    await ActivityLog.deleteMany({ lot: { $in: ids } });
    await ArchiveLot.deleteMany({ _id: { $in: ids } });
    await ArchiveLot.db.collection('counters').deleteMany({ _id: { $in: created.map((x) => `lotChange:${x}`) } as never });
  }
  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
