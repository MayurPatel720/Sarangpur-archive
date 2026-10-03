/**
 * Integration check for the project wizard / shared-data sync / assignee rule.
 *
 *   npm run verify:project-sync
 *
 * Runs the REAL server functions against the configured database (needs a seeded DB
 * with a replica set), creates a throw-away project, asserts the behaviour, and
 * removes everything it created.
 */
import './load-env';

import { Types } from 'mongoose';
import { connectToDatabase } from '../src/lib/mongo';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { ActivityLog } from '../src/models/ActivityLog';
import { LotItem } from '../src/models/LotItem';
import { Project } from '../src/models/Project';
import { User } from '../src/models/User';
import type { MutationContext } from '../src/lib/api';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createProject, updateProject, assignLot, unassignLot, setLotAssignee, addProjectMedia } from '../src/server/projects/mutations';
import { patchLot, submitForDecision, createIntake, replaceMediaLines } from '../src/server/lots/mutations';
import { getProjectDetail } from '../src/server/projects/queries';
import { getLotDetail } from '../src/server/lots/queries';

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
  const users = await User.find({}).select('name').limit(3).lean();
  if (users.length < 3) throw new Error('Need at least 3 users — run `npm run seed` first.');
  const [u1, u2, u3] = users as [typeof users[0], typeof users[0], typeof users[0]];
  const ctxFor = (u: typeof u1, grants: string[]): MutationContext => ({
    userId: String(u._id),
    userName: u.name as string,
    roleKey: 'test',
    grants,
  });
  const admin = ctxFor(u1, [...ALL_PERMISSIONS]);
  const VOL = ['lot:view', 'lot:edit', 'item:create', 'project:view'];
  const volA = ctxFor(u2, VOL);
  const volB = ctxFor(u3, VOL);

  const sample = async (format: string) => {
    const l = await ArchiveLot.findOne({ format }).select('mediaLines format dataType mediaSubtype').lean();
    if (!l) throw new Error(`No ${format} lot in the database to borrow a valid sub-type from.`);
    return { format, dataType: l.dataType, mediaSubtype: l.mediaSubtype };
  };
  const photo = await sample('photo');
  const video = await sample('video');

  const code = `VERIFY-${Date.now()}`;
  const createdProjects: Types.ObjectId[] = [];
  const extraLots: string[] = [];
  try {
    console.log('\nCreate project (one lot per format)');
    const created = await createProject(
      {
        code,
        name: 'Verify project',
        shared: { owner: { name: 'Test Owner' } },
        mediaLines: [
          { ...photo, quantity: 5 },
          { ...photo, quantity: 3, quantityRemarks: 'second photo row' },
          { ...video, quantity: 2 },
        ],
        assignments: [
          { format: 'photo', assigneeId: String(u2._id) },
          { format: 'video', assigneeId: String(u3._id) },
        ],
      },
      admin,
    );
    createdProjects.push(new Types.ObjectId(created.id));
    check('two child lots (photo + video)', created.lots.length === 2, created.lots);
    const photoLot = created.lots.find((l) => l.format === 'photo')!;
    const videoLot = created.lots.find((l) => l.format === 'video')!;
    const pd = await getLotDetail(photoLot.id);
    check('photo lot quantity = 8', pd.lot.quantity === 8, pd.lot.quantity);
    check('shared owner copied', pd.lot.owner.name === 'Test Owner', pd.lot.owner);
    check('date/origin missing → gate list', pd.lot.intakeMissing.join() === 'Date received,Origin source', pd.lot.intakeMissing);
    check('assignee set', pd.lot.assignee?.id === String(u2._id), pd.lot.assignee);
    check('items generated (8)', (await LotItem.countDocuments({ lot: photoLot.id })) === 8);

    console.log('\nIntake gate');
    await rejects('cannot submit with date/origin missing', () => submitForDecision(photoLot.id, volA), 400);

    console.log('\nAssignee rule');
    await rejects('non-assignee cannot edit', () => patchLot(videoLot.id, { version: 0, conditionNotes: 'x' }, volA), 403);

    console.log('\nChild edit syncs to project + sibling');
    const originSource = (await ArchiveLot.findOne({ originSource: { $ne: null } }).select('originSource').lean())!.originSource!;
    const v0 = (await getLotDetail(photoLot.id)).lot.version;
    await patchLot(
      photoLot.id,
      { version: v0, originSource, dateReceived: new Date('2026-09-01T00:00:00+05:30').toISOString() },
      volA,
    );
    const sib = await getLotDetail(videoLot.id);
    check('sibling got origin', sib.lot.originSource === originSource, sib.lot.originSource);
    check('sibling got date', Boolean(sib.lot.dateReceived), sib.lot.dateReceived);
    const proj = await getProjectDetail(created.id, { lotPage: 1, lotPageSize: 25 });
    check('project shared has origin', proj.project.shared.originSource === originSource);
    check('project has nothing missing', proj.project.missing.length === 0, proj.project.missing);
    check('team derived from assignees', proj.project.team.length === 2, proj.project.team);

    console.log('\nProject edit fans out');
    await updateProject(created.id, { shared: { conditionNotes: 'Fragile reels' } }, admin);
    const both = await ArchiveLot.find({ syncProjectId: created.id }).select('conditionNotes').lean();
    check('both lots have the note', both.every((l) => l.conditionNotes === 'Fragile reels'), both);

    console.log('\nQuantity edit + gate passes');
    const d2 = await getLotDetail(photoLot.id);
    await replaceMediaLines(
      photoLot.id,
      { version: d2.lot.version, mediaLines: [{ ...photo, quantity: 10 }] },
      volA,
    );
    check('quantity now 10 with 10 items', (await LotItem.countDocuments({ lot: photoLot.id })) === 10);
    await submitForDecision(photoLot.id, volA);
    check('assignee can now send to decision', (await getLotDetail(photoLot.id)).lot.stage === 'decision');
    await rejects('other volunteer still blocked', () => patchLot(photoLot.id, { version: 99, conditionNotes: 'y' }, volB), 403);

    console.log('\nAdmin: add media, reassign, attach/detach');
    const added = await addProjectMedia(created.id, { mediaLines: [{ ...video, quantity: 4 }], assignments: [] }, admin);
    check('video lot reused, not created', added.lots[0]?.created === false, added);
    await setLotAssignee(videoLot.id, { assigneeId: String(u2._id) }, admin);
    check('reassigned', (await getLotDetail(videoLot.id)).lot.assignee?.id === String(u2._id));

    const standalone = await createIntake(
      {
        dateReceived: new Date().toISOString(),
        originSource,
        owner: { name: 'Someone Else' },
        pointsOfContact: [],
        mediaLines: [{ ...photo, quantity: 1 }],
      },
      admin,
    );
    extraLots.push(standalone.id);
    await assignLot(created.id, { lotId: standalone.id, assigneeId: String(u3._id) }, admin);
    const attached = await getLotDetail(standalone.id);
    check('attach: project wins (owner overwritten)', attached.lot.owner.name === 'Test Owner', attached.lot.owner);
    check('attach: synced + assigned', attached.lot.syncProject?.code === code && attached.lot.assignee?.id === String(u3._id));
    await unassignLot(created.id, standalone.id, admin);
    const detached = await getLotDetail(standalone.id);
    check('detach stops syncing, keeps values', detached.lot.syncProject === null && detached.lot.owner.name === 'Test Owner');
  } finally {
    const lots = await ArchiveLot.find({ $or: [{ syncProjectId: { $in: createdProjects } }, { _id: { $in: extraLots } }] })
      .select('_id')
      .lean();
    const ids = lots.map((l) => l._id);
    await LotItem.deleteMany({ lot: { $in: ids } });
    await ActivityLog.deleteMany({ $or: [{ lot: { $in: ids } }, { project: { $in: createdProjects } }] });
    await ArchiveLot.deleteMany({ _id: { $in: ids } });
    await Project.deleteMany({ _id: { $in: createdProjects } });
  }
  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
