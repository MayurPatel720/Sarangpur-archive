/**
 * Letters (the Documents format): intake with a Guru and no automatic codes, codes from scanned file names, and the
 * six-stage cycle. Needs a seeded MongoDB and `npm run db:migrate-letters`; cleans up what it creates.
 *
 *   npm run verify:documents
 */
import './load-env';

import type { MutationContext } from '../src/lib/api';
import { connectToDatabase } from '../src/lib/mongo';
import { DOC_STAGES, docStageOf, isPendingCode, stepDocStage } from '../src/lib/domain';
import { cellText } from '../src/lib/item-cells';
import { takenCodes } from '../src/server/codes';
import { letterCodeError, letterCodeOfFile } from '../src/lib/letter-code';
import { shownOnSheet } from '../src/lib/item-columns';
import { ActivityLog } from '../src/models/ActivityLog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotChangeRow, LotChangeSet, LotVersion } from '../src/models/LotChangeSet';
import { LotItem } from '../src/models/LotItem';
import { User } from '../src/models/User';
import { createItem } from '../src/server/lots/items';
import { createIntake } from '../src/server/lots/mutations';
import { moveDocumentStage, setLetterCodes } from '../src/server/lots/documents';
import { getItemsGrid } from '../src/server/lots/item-grid';
import { ALL_PERMISSIONS } from '../src/server/permissions';

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

async function main() {
  console.log('file names to codes (pure)');
  check('the extension is dropped', letterCodeOfFile('Letter 1998-04-12 Mumbai.pdf') === 'Letter 1998-04-12 Mumbai');
  check('a folder path is dropped too', letterCodeOfFile('C:\\scans\\2026\\PSM 0007.jpg') === 'PSM 0007');
  check('spaces are tidied', letterCodeOfFile('  A   B .tif') === 'A B');
  check('an empty or forbidden code is refused', letterCodeError('') !== null && letterCodeError('a/b') !== null && letterCodeError('PENDING-1') !== null && letterCodeError('Letter 1') === null);
  check('the cycle has six stages in order', DOC_STAGES.join() === 'doc_scan,doc_rewrite,doc_type,doc_recheck,doc_topics,doc_final');
  check('stepping stops at both ends', stepDocStage('doc_scan', 'back') === null && stepDocStage('doc_final', 'next') === null && stepDocStage('doc_type', 'next') === 'doc_recheck');
  check('a letters sheet shows only code, type, remark and lot columns', shownOnSheet({ id: 'code' }, 'documents') && shownOnSheet({ id: 'remarks' }, 'documents') && !shownOnSheet({ id: 'digital' }, 'documents') && !shownOnSheet({ id: 'fileName' }, 'documents') && shownOnSheet({ id: 'digital' }, 'photo'));

  await connectToDatabase();
  const u = await User.findOne({}).select('name').lean();
  if (!u) throw new Error('Run `npm run seed` first.');
  const admin: MutationContext = { userId: String(u._id), userName: u.name as string, roleKey: 'test', grants: [...ALL_PERMISSIONS] };
  const viewer = { userId: admin.userId, grants: admin.grants };
  const origin = (await ArchiveLot.findOne({ originSource: { $ne: null } }).select('originSource').lean())?.originSource;
  if (!origin) throw new Error('Need a seeded lot with an origin.');
  const created: string[] = [];
  const base = {
    dateReceived: new Date().toISOString(),
    originSource: origin,
    owner: { name: 'Verify Owner' },
    locationReceiver: { name: 'Verify Receiver' },
    pointsOfContact: [],
  };
  const letters = async (quantity: number, guru: string | undefined = 'YGJ') => {
    const r = await createIntake({ ...base, mediaLines: [{ format: 'documents', dataType: 'both', mediaSubtype: 'Letter', quantity, ...(guru ? { guru } : {}) }] }, admin);
    created.push(...r.lots.map((l) => l.id));
    return r;
  };
  const TAG = `ZZV${Date.now() % 100000}`;

  try {
    console.log('intake of letters');
    const r = await letters(3);
    const lot = (await ArchiveLot.findById(r.id).lean())!;
    check('the lot starts at Scan & storage, not Intake', lot.stage === 'doc_scan', lot.stage);
    check('the Guru is kept on the lot', lot.guru === 'YGJ', lot.guru);
    check('data type is kept (physical + digital)', lot.dataType === 'both');
    const items = await LotItem.find({ lot: lot._id }).sort({ sortOrder: 1 }).lean();
    check('one letter per quantity', items.length === 3);
    check('no code is made automatically', items.every((i) => isPendingCode(i.code)), items.map((i) => i.code));
    check('placeholders are unique', new Set(items.map((i) => i.code)).size === 3);
    await rejects('a Guru that is not in the list is refused', () => letters(1, 'ZZZ'), 400);
    const noGuru = await letters(1, '');
    check('an intake without a Guru is still accepted by the server (the form asks for it)', (await ArchiveLot.findById(noGuru.id).lean())?.guru === null);

    const split = await createIntake(
      {
        ...base,
        mediaLines: [
          { format: 'documents', dataType: 'physical', mediaSubtype: 'Letter', quantity: 2, guru: 'PSM' },
          { format: 'documents', dataType: 'both', mediaSubtype: 'Letter', quantity: 1, guru: 'MSM' },
          { format: 'documents', dataType: 'physical', mediaSubtype: 'Letter', quantity: 1, guru: 'PSM' },
        ],
      },
      admin,
    );
    created.push(...split.lots.map((l) => l.id));
    const splitLots = await ArchiveLot.find({ _id: { $in: split.lots.map((l) => l.id) } }).select('guru quantity linkGroupId').lean();
    check('rows with different Gurus stay ONE standalone lot (no linked lots)', split.lots.length === 1 && splitLots.length === 1 && splitLots[0]!.quantity === 4 && splitLots[0]!.guru === null, splitLots);
    const splitItems = await LotItem.find({ lot: split.id }).sort({ sortOrder: 1 }).select('attrs').lean();
    check('each letter keeps its own Guru', splitItems.map((i) => (i.attrs as Record<string, unknown> | undefined)?.letterGuru).join() === 'PSM,PSM,MSM,PSM', splitItems.map((i) => i.attrs));
    check('a lot with one Guru keeps it on the lot too', (await ArchiveLot.findById(r.id).lean())?.guru === 'YGJ');
    check('the Guru is a column of the letters sheet', shownOnSheet({ id: 'letterGuru' }, 'documents') && cellText({ attrs: { letterGuru: 'PSM' } } as never, { id: 'letterGuru', kind: 'ref', attr: true, refList: 'letterGuru' } as never) === 'PSM');

    console.log('the letters sheet');
    const g = await getItemsGrid(r.id, viewer);
    check('the grid lists the three letters', g.items.length === 3 && g.items.every((i) => i.format === 'documents'));

    console.log('stage gate');
    await rejects('leaving Scan & storage needs every letter coded', () => moveDocumentStage(r.id, { direction: 'next' }, admin), 409);
    await rejects('the first stage cannot go back', () => moveDocumentStage(r.id, { direction: 'back' }, admin), 400);

    console.log('codes from scanned files');
    const ids = items.map((i) => String(i._id));
    const res = await setLetterCodes(r.id, { assignments: [{ itemId: ids[0]!, code: `${TAG} Letter 1.pdf` }, { itemId: ids[1]!, code: `${TAG} Letter 2.pdf` }] }, admin);
    check('the file name (no extension) becomes the code', res.updated === 2 && res.codes[0]!.code === `${TAG} Letter 1`, res.codes);
    const after = await LotItem.find({ lot: lot._id }).sort({ sortOrder: 1 }).lean();
    check('the codes are saved on the letters', after[0]!.code === `${TAG} Letter 1` && after[1]!.code === `${TAG} Letter 2` && isPendingCode(after[2]!.code));
    await rejects('a stage move is still refused while one letter has no code', () => moveDocumentStage(r.id, { direction: 'next' }, admin), 409);
    await rejects('the same code twice in one go is refused', () => setLetterCodes(r.id, { assignments: [{ itemId: ids[2]!, code: `${TAG} Same.pdf` }, { itemId: ids[0]!, code: `${TAG} Same.png` }] }, admin), 400);
    const other = await letters(1);
    const otherItem = (await LotItem.findOne({ lot: other.id }).lean())!;
    await rejects('a code already used elsewhere is refused', () => setLetterCodes(other.id, { assignments: [{ itemId: String(otherItem._id), code: `${TAG} Letter 1.pdf` }] }, admin), 409);
    await rejects('a forbidden character is refused', () => setLetterCodes(r.id, { assignments: [{ itemId: ids[2]!, code: 'a:b.pdf' }] }, admin), 400);
    await setLetterCodes(r.id, { assignments: [{ itemId: ids[2]!, code: `${TAG} Letter 3.pdf` }] }, admin);
    check('every letter is coded now', (await LotItem.countDocuments({ lot: lot._id, code: /^PENDING-/ })) === 0);
    check('setting codes is recorded in the lot history', (await LotChangeSet.countDocuments({ lot: lot._id, label: /letter code/i })) >= 2);

    console.log('adding letters later');
    await createItem(r.id, { quantity: 2 }, admin);
    const added = await LotItem.find({ lot: lot._id, code: /^PENDING-/ }).lean();
    check('letters added later also wait for a file (no automatic code)', added.length === 2 && new Set(added.map((a) => a.code)).size === 2, added.map((a) => a.code));
    const extra = added.map((a) => String(a._id));
    await setLetterCodes(r.id, { assignments: [{ itemId: extra[0]!, code: `${TAG} Letter 4.pdf` }, { itemId: extra[1]!, code: `${TAG} Letter 5.pdf` }] }, admin);

    console.log('stages per letter');
    await moveDocumentStage(r.id, { stage: 'doc_type', itemIds: [ids[0]!] }, admin);
    const one = await LotItem.find({ lot: lot._id }).select('attrs').lean();
    check('one letter moves on its own', one.filter((i) => docStageOf(i.attrs as Record<string, unknown>) === 'doc_type').length === 1);
    check('the lot stays at its least advanced letter', (await ArchiveLot.findById(r.id).select('stage').lean())?.stage === 'doc_scan');
    check('the sheet shows done / now per stage column', cellText({ attrs: { docStage: 'doc_type' } } as never, { id: 'ds_doc_scan', kind: 'docStage' } as never) === 'Done' && cellText({ attrs: { docStage: 'doc_type' } } as never, { id: 'ds_doc_type', kind: 'docStage' } as never) === 'Now' && cellText({ attrs: { docStage: 'doc_type' } } as never, { id: 'ds_doc_final', kind: 'docStage' } as never) === '');
    await moveDocumentStage(r.id, { stage: 'doc_scan' }, admin);
    check('every letter can be put back at once', (await ArchiveLot.findById(r.id).select('stage').lean())?.stage === 'doc_scan');
    const taken = await takenCodes([`${TAG} Letter 1`, `${TAG} LETTER 1`]);
    check('only the whole code counts as used', taken.has(`${TAG} Letter 1`) && !taken.has(`${TAG} LETTER 1`));
    await rejects('a code that differs only in capital letters is still refused for letters', () => setLetterCodes(other.id, { assignments: [{ itemId: String(otherItem._id), code: `${TAG} LETTER 1.pdf` }] }, admin), 409);

    console.log('the cycle');
    const labels: string[] = [];
    for (const want of ['doc_rewrite', 'doc_type', 'doc_recheck', 'doc_topics', 'doc_final']) {
      const m = await moveDocumentStage(r.id, { direction: 'next' }, admin);
      labels.push(m.label);
      check(`moves to ${want}`, m.stage === want, m);
    }
    check('stage labels come from the Stages list', labels.join(' > ') === 'Rewrite > Type > Recheck > Topics > Final edit', labels);
    await rejects('the last stage cannot go further', () => moveDocumentStage(r.id, { direction: 'next' }, admin), 400);
    const back = await moveDocumentStage(r.id, { direction: 'back' }, admin);
    check('it can go back one stage', back.stage === 'doc_topics');
    check('each move is in the activity log', (await ActivityLog.countDocuments({ lot: lot._id, kind: 'document_stage_changed' })) === 8);
    check('the stage time is stamped', Boolean((await ArchiveLot.findById(r.id).select('stageEnteredAt').lean())?.stageEnteredAt));

    console.log('only letters use this');
    const photo = await ArchiveLot.findOne({ format: 'photo' }).select('_id').lean();
    if (photo) await rejects('a photo lot cannot be moved through letter stages', () => moveDocumentStage(String(photo._id), { direction: 'next' }, admin), 400);
    if (photo) {
      const photoItem = await LotItem.findOne({ lot: photo._id }).select('_id').lean();
      if (photoItem) await rejects('a photo lot cannot take codes from files', () => setLetterCodes(String(photo._id), { assignments: [{ itemId: String(photoItem._id), code: `${TAG} x.pdf` }] }, admin), 400);
    }
  } finally {
    await LotChangeRow.deleteMany({ lot: { $in: created } });
    await LotChangeSet.deleteMany({ lot: { $in: created } });
    await LotVersion.deleteMany({ lot: { $in: created } });
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
