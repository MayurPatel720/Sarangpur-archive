/**
 * Integration check for per-item decisions ("split by item").
 *
 *   npm run verify:item-decisions
 *
 * Runs the real server functions against the configured database, then removes
 * everything it created.
 */
import './load-env';

import { connectToDatabase } from '../src/lib/mongo';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { ActivityLog } from '../src/models/ActivityLog';
import { LotItem } from '../src/models/LotItem';
import { User } from '../src/models/User';
import type { MutationContext } from '../src/lib/api';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { bulkUpdateItems, getItemsGrid, listItemDispositions, markItemDispositionsDone } from '../src/server/lots/item-grid';

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
    check(label, (e as { status?: number }).status === status, (e as Error).message);
  }
}

async function main() {
  await connectToDatabase();
  const u = await User.findOne({}).select('name').lean();
  if (!u) throw new Error('Run `npm run seed` first.');
  const admin: MutationContext = { userId: String(u._id), userName: u.name as string, roleKey: 'test', grants: [...ALL_PERMISSIONS] };
  const sample = await ArchiveLot.findOne({ format: 'photo', originSource: { $ne: null } }).select('dataType mediaSubtype originSource').lean();
  if (!sample) throw new Error('Need a seeded photo lot.');
  const created: string[] = [];
  try {
    const lot = await createIntake(
      {
        dateReceived: new Date().toISOString(),
        originSource: sample.originSource!,
        owner: { name: 'Verify Owner' },
        pointsOfContact: [],
        mediaLines: [{ format: 'photo', dataType: sample.dataType, mediaSubtype: sample.mediaSubtype, quantity: 3 }],
      },
      admin,
    );
    created.push(lot.id);
    const g0 = await getItemsGrid(lot.id, { userId: admin.userId, grants: admin.grants });
    check('3 items in the grid', g0.items.length === 3);
    check('decisions editable at intake', g0.editable.decision);
    const [a, b, c] = g0.items.map((i) => i.id) as [string, string, string];

    await rejects('cannot decide an unnamed item', () => bulkUpdateItems(lot.id, { itemIds: [a], set: { existsInMls: false } }, admin), 400);

    await bulkUpdateItems(lot.id, { itemIds: [a, b, c], set: { name: 'Tape', place: 'Sarangpur' } }, admin);
    const r1 = await bulkUpdateItems(
      lot.id,
      { itemIds: [a, b], set: { existsInMls: false, conditionUsable: true, significant: true } },
      admin,
    );
    check('two archived, lot not decided yet', r1.summary.archive === 2 && r1.finalized === null, r1.summary);

    const r2 = await bulkUpdateItems(lot.id, { itemIds: [c], set: { existsInMls: false, conditionUsable: true, significant: false } }, admin);
    check('third is "return or discard?" (undecided)', r2.summary.decided === 2 && r2.finalized === null, r2.summary);

    const r3 = await bulkUpdateItems(lot.id, { itemIds: [c], set: { disposition: 'return' } }, admin);
    check('needs a reason before the lot moves on', r3.finalized === null && r3.blockedBy.length === 1, r3.blockedBy);

    const r4 = await bulkUpdateItems(lot.id, { itemIds: [c], set: { reason: 'not_significant' } }, admin);
    check('last decision finalises the lot as archive', r4.finalized?.decision === 'archive' && r4.finalized.stage === 'metadata', r4.finalized);
    const kept = await LotItem.countDocuments({ lot: lot.id, selectedForDigitization: true });
    check('only archived items kept for digitization', kept === 2, kept);

    const q = await listItemDispositions({ kind: 'return', status: 'pending', page: 1, pageSize: 200 });
    const row = q.rows.find((r) => r.id === c);
    check('returned item is in the item return queue', Boolean(row), q.rows.length);

    await rejects('decisions locked after the lot is decided', () => bulkUpdateItems(lot.id, { itemIds: [a], set: { significant: false } }, admin), 400);
    await bulkUpdateItems(lot.id, { itemIds: [a], set: { remarks: 'still editable' } }, admin);
    check('details still editable after decision', true);

    const done = await markItemDispositionsDone({ kind: 'return', itemIds: [c] }, admin);
    check('marked returned', done.updated === 1, done);
  } finally {
    await LotItem.deleteMany({ lot: { $in: created } });
    await ActivityLog.deleteMany({ lot: { $in: created } });
    await ArchiveLot.deleteMany({ _id: { $in: created } });
  }
  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
