/**
 * Integration check for projects (a name + description that group lots), the intake that makes one linked lot per format,
 * adding lots to a project, and the assignee rule.
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
import { createProject, updateProject, assignLot, unassignLot, setLotAssignee } from '../src/server/projects/mutations';
import { patchLot, submitForDecision, createIntake } from '../src/server/lots/mutations';
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

  const createdProjects: Types.ObjectId[] = [];
  const createdLots: string[] = [];
  try {
    console.log('\nCreate project (name + description only)');
    const created = await createProject({ name: 'Verify project', description: 'Throw-away' }, admin);
    createdProjects.push(new Types.ObjectId(created.id));
    const empty = await getProjectDetail(created.id, { lotPage: 1, lotPageSize: 25 }, admin.grants);
    check('a new project has no lots', empty.project.lotCount === 0 && empty.lots.total === 0, empty.project);
    check('description kept', empty.project.description === 'Throw-away');

    console.log('\nIntake from a project: one lot per format, linked, inside the project');
    const originSource = (await ArchiveLot.findOne({ originSource: { $ne: null } }).select('originSource').lean())!.originSource!;
    const intake = {
      dateReceived: new Date().toISOString(),
      originSource,
      owner: { name: 'Verify Owner' },
      locationReceiver: { name: 'Verify Receiver' },
      pointsOfContact: [],
      mediaLines: [
        { ...photo, quantity: 5 },
        { ...photo, quantity: 3, quantityRemarks: 'second photo row' },
        { ...video, quantity: 2 },
      ],
    };
    await rejects('adding to a project needs project:assign', () => createIntake({ ...intake, projectId: created.id }, volA), 403);
    const made = await createIntake({ ...intake, projectId: created.id }, admin);
    createdLots.push(...made.lots.map((l) => l.id));
    check('two lots (photo + video), not one', made.lots.length === 2 && made.lots.map((l) => l.format).sort().join() === 'photo,video', made.lots);
    const photoLot = made.lots.find((l) => l.format === 'photo')!;
    const videoLot = made.lots.find((l) => l.format === 'video')!;
    const pd = await getLotDetail(photoLot.id);
    check('photo lot holds both photo rows (quantity 8)', pd.lot.quantity === 8 && (await LotItem.countDocuments({ lot: photoLot.id })) === 8, pd.lot.quantity);
    check('each lot keeps its own owner details', pd.lot.owner.name === 'Verify Owner');
    check('lots from one form are linked to each other', pd.lot.linkedLots.length === 1 && pd.lot.linkedLots[0]!.id === videoLot.id, pd.lot.linkedLots);
    check('the project counts them', (await Project.findById(created.id).lean())!.lotCount === 2);
    check('nothing is synced', pd.lot.syncProject === null);
    const proj = await getProjectDetail(created.id, { lotPage: 1, lotPageSize: 25 }, admin.grants);
    check('the project page lists both lots', proj.lots.total === 2 && proj.progress.lotsTotal === 2, proj.lots.total);

    console.log('\nStandalone intake: also one lot per format, linked');
    const alone = await createIntake(intake, admin);
    createdLots.push(...alone.lots.map((l) => l.id));
    check('standalone with two formats makes two lots', alone.lots.length === 2, alone.lots);
    const aloneDetail = await getLotDetail(alone.lots[0]!.id);
    check('the standalone lots are linked, with no project', aloneDetail.lot.linkedLots.length === 1 && aloneDetail.lot.linkedLots[0]!.id === alone.lots[1]!.id, aloneDetail.lot.linkedLots);
    const single = await createIntake({ ...intake, mediaLines: [{ ...photo, quantity: 2 }] }, admin);
    createdLots.push(single.id);
    check('a single-format intake has nothing linked', (await getLotDetail(single.id)).lot.linkedLots.length === 0);

    console.log('\nAttach an existing lot, then detach');
    await assignLot(created.id, { lotId: single.id }, admin);
    check('attached: counted once', (await Project.findById(created.id).lean())!.lotCount === 3);
    await assignLot(created.id, { lotId: single.id }, admin);
    check('adding again changes nothing', (await Project.findById(created.id).lean())!.lotCount === 3);
    check('the lot keeps its own details', (await getLotDetail(single.id)).lot.owner.name === 'Verify Owner');
    await unassignLot(created.id, single.id, admin);
    check('detached: count back to 2', (await Project.findById(created.id).lean())!.lotCount === 2);

    console.log('\nUpdate and lot rules');
    await updateProject(created.id, { name: 'Verify project 2', description: null }, admin);
    const upd = await getProjectDetail(created.id, { lotPage: 1, lotPageSize: 25 }, admin.grants);
    check('name and description updated', upd.project.name === 'Verify project 2' && upd.project.description === null, upd.project);
    await setLotAssignee(videoLot.id, { assigneeId: String(u2._id) }, admin);
    check('reassigned', (await getLotDetail(videoLot.id)).lot.assignee?.id === String(u2._id));
    await rejects('a non-assignee cannot edit the lot', () => patchLot(videoLot.id, { version: 0, conditionNotes: 'x' }, volB), 403);
    const noVideo = admin.grants.filter((g) => g !== 'format:video');
    const lockedView = await getProjectDetail(created.id, { lotPage: 1, lotPageSize: 25 }, noVideo);
    const lrow = lockedView.lots.rows.find((r) => r.id === videoLot.id);
    check('a lot of a format you cannot open is locked, with only its number and format', lrow?.locked === true && lrow.format === 'video' && lrow.ownerName === '' && lrow.quantity === 0, lrow);

    console.log('\nSubmit moves a lot Intake → Data entry → Decision');
    await setLotAssignee(photoLot.id, { assigneeId: String(u2._id) }, admin);
    await submitForDecision(photoLot.id, volA);
    check('data entry first', (await getLotDetail(photoLot.id)).lot.stage === 'metadata');
    await submitForDecision(photoLot.id, volA);
    check('then decision', (await getLotDetail(photoLot.id)).lot.stage === 'decision');
  } finally {
    const lots = await ArchiveLot.find({ $or: [{ projectIds: { $in: createdProjects } }, { _id: { $in: createdLots } }] })
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
