/**
 * Integration check for the lot's Excel (Items tab): decisions, stage follow-through, item
 * codes, duplicates, row order, custom / hidden columns and Excel import.
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
import { Task } from '../src/models/Task';
import { deleteLotImage, listLotImages } from '../src/server/lots/images';
import type { MutationContext } from '../src/lib/api';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { bulkUpdateItems, getItemsGrid, listItemDispositions, markItemDispositionsDone } from '../src/server/lots/item-grid';
import { markDuplicate, recodeSheet, reorderItems, setItemNumber, updateColumns } from '../src/server/lots/item-codes';
import { importItems } from '../src/server/lots/item-import';
import { listPrasadiChecks, markPrasadiChecked } from '../src/server/lots/prasadi-checks';
import { parseDateRange, formatDateRange, isoDayToDmy } from '../src/lib/date-range';
import { autoDecisionFields, itemResultOf } from '../src/lib/item-decision';
import { buildItemCode, parseItemCodeParts } from '../src/lib/item-code';
import type { GridItem, ImportBody } from '../src/types/items';
import { allColumns, appliesToFormat, isCommonColumn } from '../src/lib/item-columns';
import { daysOverdue, nextCheckDate, weeksText } from '../src/lib/recheck';
import { buildItemsWorkbook, readItemsFromExcel } from '../src/components/lots/excel-io';

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

const isoToDmy = (d: Date) => isoDayToDmy(d.toISOString().slice(0, 10));

function pureChecks() {
  console.log('pure helpers');
  const r = parseDateRange('12/03/1998 - 20/03/1998');
  check('date range parses', r.ok && r.from === '1998-03-12' && r.to === '1998-03-20', r);
  const one = parseDateRange('05/06/1990');
  check('single day = from equals to', one.ok && one.from === one.to, one);
  const month = parseDateRange('02/1996');
  check('mm/yyyy = whole month', month.ok && month.from === '1996-02-01' && month.to === '1996-02-29', month);
  const year = parseDateRange('1985');
  check('yyyy = whole year', year.ok && year.from === '1985-01-01' && year.to === '1985-12-31', year);
  check('reversed range rejected', !parseDateRange('20/03/1998 - 12/03/1998').ok);
  check('bad day rejected', !parseDateRange('31/02/1998').ok);
  check('range formats back', formatDateRange('1998-03-12', '1998-03-20') === '12/03/1998 - 20/03/1998');
  check('same-day range formats as one date', formatDateRange('1998-03-12', '1998-03-12') === '12/03/1998');
  check('all No = physical only', itemResultOf({ digital: false, redigital: false, discard: false }) === 'physical');
  check('discard only', itemResultOf({ digital: false, redigital: false, discard: true }) === 'discard');
  check('digital + discard = digitize first', itemResultOf({ digital: true, redigital: false, discard: true }) === 'archive');
  check('redigital digitizes', itemResultOf({ digital: false, redigital: true, discard: false }) === 'archive');
  check('unanswered = undecided', itemResultOf({ digital: true, redigital: null, discard: false }) === null);
  const p = parseItemCodeParts('ALB-surat-0001-R-000');
  check('item code parses', p?.abbr1 === 'ALB' && p.abbr2 === 'surat' && p.no === 1 && p.kind === 'R' && p.copy === 0, p);
  check('item code round-trips', p ? buildItemCode(p) === 'ALB-surat-0001-R-000' : false);
}

/** Export → .xlsx → read back: the layout (department band, names) must survive a round trip. */
async function excelRoundTrip() {
  console.log('excel file round trip');
  const row = (n: number, over: Partial<GridItem> = {}): GridItem => ({
    id: String(n), code: `ALB-surat-000${n}-R-000`, groupNo: 1, itemNo: n, lineIndex: 0, sortOrder: n, format: 'photo', dataType: 'both',
    subtypeLabel: '35MM Film — Album', senderCode: null, dateRange: '', place: null, nameOnTape: null, nameOnCase: null,
    physicalSource: null, remarks: null, duplicateCode: null, duplicatedBy: [], digital: null, redigital: null, discard: null,
    decisionRemark: null, result: null, captured: false, digitalSource: null, fileName: null, phyStorageLoc: null,
    disposition: null, dispositionStatus: null, taggedInMls: false, storageRemark: null, logged: false, loggedAt: '',
    loggerName: null, custom: {}, itemName: null, description: null, event: null, itemCondition: null, attrs: {},
    recheckWeeks: null, nextCheckDue: '', lastCheckedAt: '', ...over,
  });
  const custom = [{ key: 'c_1', label: 'Reel', type: 'number' as const, dept: 'storage' as const }];
  const wb = await buildItemsWorkbook({
    sheets: [{ name: 'Album: 35MM/Film', rows: [row(1, { place: 'Surat, Mumbai', dateRange: '12/03/1998 - 20/03/1998', digital: true, redigital: false, discard: true, remarks: 'r1', custom: { c_1: 4 } }), row(2)] }],
    columns: allColumns(custom),
    refLabel: (_l, v) => v ?? '',
  });
  const buf = await wb.xlsx.writeBuffer();
  const parsed = await readItemsFromExcel(new File([buf], 'x.xlsx'));
  const r1 = parsed.rows.find((r) => r.code === 'ALB-surat-0001-R-000');
  check('sheet name made Excel-safe and read back', parsed.sheets === 1 && wb.worksheets[0]!.name === 'Album 35MM Film', wb.worksheets[0]!.name);
  check('both rows read, keyed by Archive code', parsed.rows.length === 2 && Boolean(r1), parsed.rows.length);
  check('cells keyed by department and column name', r1?.cells['Details|Place'] === 'Surat, Mumbai' && r1.cells['Details|Date'] === '12/03/1998 - 20/03/1998' && r1.cells['Decision|Digital'] === 'Yes' && r1.cells['Decision|Discard'] === 'Yes', r1?.cells);
  check('same column name in two departments stays apart', r1?.cells['Details|Remark'] === 'r1' && !('Decision|Remark' in r1.cells), r1?.cells);
  check('custom column travels with its department', r1?.cells['Digitalization & Storage|Reel'] === '4', r1?.cells);
  check('blank cells are left out', !('Details|Place' in (parsed.rows.find((r) => r.code === 'ALB-surat-0002-R-000')?.cells ?? {})));

  // Prasadi sheets: their own columns, no tape / case / digital-source / duplicate columns.
  const labelsFor = (format: string) => allColumns([]).filter((c) => appliesToFormat(c, format)).map((c) => c.label);
  const prs = labelsFor('prasadi');
  const vid = labelsFor('video');
  check('prasadi gets its own columns', ['Prasadi item', 'Description', 'Blessed by', 'Occasion', 'Condition', 'Sticker applied', 'Re-check in', 'Next check due', 'Last checked'].every((l) => prs.includes(l)), prs);
  check('prasadi has no quantity column', !prs.includes('Quantity'), prs);
  check('prasadi drops video-only columns', !['Name on tape', 'Name on case', 'Dig source', 'Duplicate code'].some((l) => prs.includes(l)), prs);
  check('prasadi has no Decision columns and no Captured', !['Digital', 'Redigital', 'Discard', 'Captured'].some((l) => prs.includes(l)), prs);
  check('prasadi keeps path / storage / MLS / remark', ['File path', 'Phy storage loc.', 'MLS tagged', 'Return / discard', 'Remark', 'Date', 'Place'].every((l) => prs.includes(l)), prs);
  check('video has no prasadi columns but keeps tape / case / decision', !vid.includes('Blessed by') && !vid.includes('Sticker applied') && !vid.includes('Re-check in') && vid.includes('Name on tape') && vid.includes('Name on case') && vid.includes('Digital') && vid.includes('Captured'), vid);
  check('no format known = every column', allColumns([]).every((c) => appliesToFormat(c, null)));
  const common = allColumns([]).filter(isCommonColumn).map((c) => c.label);
  check('common columns carry no format-specific column', !['Blessed by', 'Name on tape', 'Digital', 'Re-check in'].some((l) => common.includes(l)) && common.includes('Place') && common.includes('Logging date'), common);
  check('every attr column is prasadi-only and text / flag', allColumns([]).filter((c) => c.attr).every((c) => c.formats?.includes('prasadi') && (c.kind === 'text' || c.kind === 'flag')));
  check('weeks → due date', nextCheckDate(new Date('2026-10-17T15:00:00Z'), 3).toISOString().slice(0, 10) === '2026-11-07');
  check('overdue days', daysOverdue(new Date('2026-11-07T00:00:00Z'), new Date('2026-11-10T08:00:00Z')) === 3 && daysOverdue(new Date('2026-11-07T00:00:00Z'), new Date('2026-11-07T23:00:00Z')) === 0);
  check('weeks text', weeksText(1) === '1 week' && weeksText(3) === '3 weeks');
  check('prasadi auto-decides as keep physical', itemResultOf(autoDecisionFields('prasadi')!.decision) === 'physical' && autoDecisionFields('video') === null);
  const prsRow = row(3, { format: 'prasadi', itemName: 'Mala', attrs: { blessedBy: 'Pramukh Swami Maharaj', stickerApplied: true }, recheckWeeks: 3, nextCheckDue: '07/11/2026' });
  const prsWb = await buildItemsWorkbook({
    sheets: [{ name: 'Prasadi', rows: [prsRow], columns: allColumns([]).filter((c) => appliesToFormat(c, 'prasadi')) }],
    columns: allColumns([]),
    refLabel: (_l, v) => v ?? '',
  });
  const prsParsed = await readItemsFromExcel(new File([await prsWb.xlsx.writeBuffer()], 'p.xlsx'));
  const pc = prsParsed.rows[0]?.cells ?? {};
  check('prasadi sheet exports Prasadi cells and no tape column', pc['Details|Prasadi item'] === 'Mala' && pc['Details|Blessed by'] === 'Pramukh Swami Maharaj' && pc['Digitalization & Storage|Sticker applied'] === 'Yes' && pc['Digitalization & Storage|Re-check in'] === '3 weeks' && pc['Digitalization & Storage|Next check due'] === '07/11/2026' && !('Details|Name on tape' in pc), pc);
}

async function main() {
  pureChecks();
  await excelRoundTrip();
  await connectToDatabase();
  const u = await User.findOne({}).select('name').lean();
  if (!u) throw new Error('Run `npm run seed` first.');
  const admin: MutationContext = { userId: String(u._id), userName: u.name as string, roleKey: 'test', grants: [...ALL_PERMISSIONS] };
  const viewer = { userId: admin.userId, grants: admin.grants };
  const sample = await ArchiveLot.findOne({ format: 'photo', originSource: { $ne: null } }).select('dataType mediaSubtype originSource').lean();
  if (!sample) throw new Error('Need a seeded photo lot.');
  const created: string[] = [];
  const intake = async (quantity: number) => {
    const lot = await createIntake(
      {
        dateReceived: new Date().toISOString(),
        originSource: sample.originSource!,
        owner: { name: 'Verify Owner' },
        pointsOfContact: [],
        mediaLines: [{ format: 'photo', dataType: sample.dataType, mediaSubtype: sample.mediaSubtype, quantity }],
      },
      admin,
    );
    created.push(lot.id);
    return lot;
  };
  const grid = (id: string) => getItemsGrid(id, viewer);

  try {
    console.log('decisions → lot');
    const lot = await intake(4);
    const g0 = await grid(lot.id);
    check('4 items, in row order', g0.items.length === 4 && g0.items.every((it, i) => it.sortOrder === i), g0.items.map((i) => i.sortOrder));
    check('decisions editable at intake', g0.editable.decision);
    const [a, b, c, d] = g0.items.map((i) => i.id) as [string, string, string, string];

    await bulkUpdateItems(
      lot.id,
      { itemIds: [a], set: { dateRange: '12/03/1998 - 20/03/1998', place: 'Surat, Mumbai', nameOnTape: 'Tape 1', senderCode: 'S-77', remarks: 'ok' } },
      admin,
    );
    const ga = (await grid(lot.id)).items.find((i) => i.id === a)!;
    check('details saved', ga.dateRange === '12/03/1998 - 20/03/1998' && ga.place === 'Surat, Mumbai' && ga.nameOnTape === 'Tape 1' && ga.senderCode === 'S-77', ga);
    await rejects('bad date range is rejected', () => bulkUpdateItems(lot.id, { itemIds: [a], set: { dateRange: '31/02/1998' } }, admin), 400);

    const r1 = await bulkUpdateItems(lot.id, { itemIds: [a], set: { digital: true, redigital: false, discard: true } }, admin);
    check('digitize + discard physical = archive result', r1.summary.archive === 1 && r1.finalized === null, r1.summary);
    const disp = (await grid(lot.id)).items.find((i) => i.id === a)!;
    check('discard = Yes pre-fills return / discard', disp.disposition === 'discard' && disp.dispositionStatus === 'pending', disp);

    await bulkUpdateItems(lot.id, { itemIds: [b], set: { digital: false, redigital: false, discard: false } }, admin);
    const r2 = await bulkUpdateItems(lot.id, { itemIds: [c], set: { digital: false, redigital: false, discard: true } }, admin);
    check('three decided, lot not yet', r2.summary.decided === 3 && r2.finalized === null, r2.summary);
    const r3 = await bulkUpdateItems(lot.id, { itemIds: [d], set: { digital: false, redigital: true, discard: false } }, admin);
    check('last decision finalises the lot as archive', r3.finalized?.decision === 'archive' && r3.finalized.stage === 'metadata', r3.finalized);
    const kept = await LotItem.countDocuments({ lot: lot.id, selectedForDigitization: true });
    check('only items to digitize stay selected', kept === 2, kept);

    const q = await listItemDispositions({ kind: 'discard', status: 'pending', page: 1, pageSize: 200 });
    const rowA = q.rows.find((r) => r.id === a);
    const rowC = q.rows.find((r) => r.id === c);
    check('discard queue holds both, digitize-first one waits for capture', Boolean(rowA?.waitingForCapture) && rowC !== undefined && !rowC.waitingForCapture, q.rows.map((r) => [r.code, r.waitingForCapture]));
    await rejects('cannot discard before the file is captured', () => markItemDispositionsDone({ kind: 'discard', itemIds: [a] }, admin), 400);
    const done = await markItemDispositionsDone({ kind: 'discard', itemIds: [c] }, admin);
    check('discard-only item marked discarded', done.updated === 1, done);

    await rejects('decisions locked after the lot is decided', () => bulkUpdateItems(lot.id, { itemIds: [b], set: { digital: true } }, admin), 400);
    await bulkUpdateItems(lot.id, { itemIds: [b], set: { remarks: 'still editable' } }, admin);
    check('other columns stay editable after the decision', true);

    console.log('stage follows the Excel');
    await bulkUpdateItems(lot.id, { itemIds: [a], set: { captured: true } }, admin);
    check('first capture → scanning', (await ArchiveLot.findById(lot.id).lean())?.stage === 'scanning');
    await bulkUpdateItems(lot.id, { itemIds: [d], set: { captured: true } }, admin);
    check('all captured → mls_tag', (await ArchiveLot.findById(lot.id).lean())?.stage === 'mls_tag');
    await bulkUpdateItems(lot.id, { itemIds: [a, d], set: { taggedInMls: true } }, admin);
    check('tagged but not logged stays mls_tag', (await ArchiveLot.findById(lot.id).lean())?.stage === 'mls_tag');
    await bulkUpdateItems(lot.id, { itemIds: [a, b, c, d], set: { logged: true } }, admin);
    const gl = await grid(lot.id);
    const logged = gl.items[0]!;
    check('logging stamps date and name', logged.logged && logged.loggedAt !== '' && logged.loggerName === admin.userName, logged);
    check('every row logged → storage', (await ArchiveLot.findById(lot.id).lean())?.stage === 'storage');
    const del = await markItemDispositionsDone({ kind: 'discard', itemIds: [a] }, admin);
    check('captured item can now be discarded', del.updated === 1, del);
    const lotAfter = await ArchiveLot.findById(lot.id).lean();
    check('lot with digitized items stays in storage', lotAfter?.stage === 'storage', lotAfter?.stage);

    console.log('item codes');
    const lotB = await intake(3);
    const gb = await grid(lotB.id);
    const pair = parseItemCodeParts(gb.items[0]!.code)!;
    const rc = await recodeSheet(lotB.id, { lineIndex: 0, abbr1: 'VER', abbr2: 'tst', startNo: 7000 }, admin);
    check('sheet re-coded from a chosen start', rc.firstCode === 'VER-tst-7000-R-000' && rc.lastCode === 'VER-tst-7002-R-000', rc);
    const lotC = await intake(2);
    await rejects('start number overlapping another sheet is refused', () => recodeSheet(lotC.id, { lineIndex: 0, abbr1: 'VER', abbr2: 'tst', startNo: 7002 }, admin), 409);
    const rc2 = await recodeSheet(lotC.id, { lineIndex: 0, abbr1: 'VER', abbr2: 'tst' }, admin);
    check('no start continues after the highest in use', rc2.firstCode === 'VER-tst-7003-R-000', rc2);
    const rc3 = await recodeSheet(lotC.id, { lineIndex: 0, abbr1: 'VER', abbr2: 'tst', startNo: 7010 }, admin);
    check('jumping ahead is allowed', rc3.firstCode === 'VER-tst-7010-R-000', rc3);
    const gc = await grid(lotC.id);
    const freed = await setItemNumber(lotC.id, { itemId: gc.items[0]!.id, no: 7004 }, admin);
    check('a jumped-over number can be used later', freed.code === 'VER-tst-7004-R-000', freed);
    await rejects('a used number is refused', () => setItemNumber(lotC.id, { itemId: gc.items[1]!.id, no: 7000 }, admin), 409);
    void pair;

    console.log('duplicates');
    const original = 'VER-tst-7000-R-000'; // lot B, already "stored"
    const dupItem = gc.items[1]!; // lot C: becomes the duplicate
    const plan = await markDuplicate(lotC.id, { itemId: dupItem.id, otherCode: original, swap: false, confirm: false }, admin);
    check('plan: other item is main, this one gets the D code', plan.main.code === original && plan.duplicate.newCode === 'VER-tst-7000-D-000' && !plan.applied, plan);
    const applied = await markDuplicate(lotC.id, { itemId: dupItem.id, otherCode: original, swap: false, confirm: true }, admin);
    check('duplicate applied', applied.applied, applied);
    const gc2 = await grid(lotC.id);
    const dupRow = gc2.items.find((i) => i.id === dupItem.id)!;
    check('duplicate re-coded and linked', dupRow.code === 'VER-tst-7000-D-000' && dupRow.duplicateCode === original, dupRow);
    const gbAfter = await grid(lotB.id);
    const origRow = gbAfter.items.find((i) => i.code === original)!;
    check('original is untouched and shows the back-link', origRow.code === original && origRow.duplicatedBy.includes('VER-tst-7000-D-000'), origRow);
    check('duplicate’s old number is free again', (await LotItem.countDocuments({ code: dupItem.code })) === 0);
    const second = await markDuplicate(lotC.id, { itemId: gc2.items.find((i) => i.id !== dupItem.id)!.id, otherCode: original, swap: false, confirm: true }, admin);
    check('second duplicate counts up', second.duplicate.newCode === 'VER-tst-7000-D-001', second);
    await rejects('a duplicate cannot be the main item', () => markDuplicate(lotB.id, { itemId: gbAfter.items[1]!.id, otherCode: 'VER-tst-7000-D-000', swap: false, confirm: false }, admin), 400);
    await rejects('the original cannot be re-coded once it has duplicates', () => setItemNumber(lotB.id, { itemId: origRow.id, no: 7500 }, admin), 409);

    console.log('row order');
    const gr = await grid(lotB.id);
    const ids = gr.items.map((i) => i.id);
    await reorderItems(lotB.id, { lineIndex: 0, orderedIds: [...ids].reverse() }, admin);
    const gr2 = await grid(lotB.id);
    check('rows follow the dragged order', gr2.items.map((i) => i.id).join() === [...ids].reverse().join(), gr2.items.map((i) => i.code));
    await rejects('a stale order is refused', () => reorderItems(lotB.id, { lineIndex: 0, orderedIds: ids.slice(1) }, admin), 409);

    console.log('columns');
    const cols = await updateColumns(lotB.id, { add: { label: 'Reel', type: 'number', dept: 'storage' } }, admin);
    const key = cols.customColumns[0]!.key;
    check('custom column added to a department', cols.customColumns.length === 1 && cols.customColumns[0]!.dept === 'storage', cols);
    await rejects('duplicate column name refused', () => updateColumns(lotB.id, { add: { label: 'reel', type: 'text', dept: 'storage' } }, admin), 409);
    await bulkUpdateItems(lotB.id, { itemIds: [ids[0]!], set: { custom: { [key]: 12 } } }, admin);
    check('custom value saved', (await grid(lotB.id)).items.find((i) => i.id === ids[0])!.custom[key] === 12);
    await rejects('custom value type checked', () => bulkUpdateItems(lotB.id, { itemIds: [ids[0]!], set: { custom: { [key]: 'abc' } } }, admin), 400);
    const hid = await updateColumns(lotB.id, { hidden: ['place', 'code', 'nope'] }, admin);
    check('hide keeps the code visible and ignores unknown ids', hid.hiddenColumns.length === 1 && hid.hiddenColumns[0] === 'place', hid);
    check('hidden columns are shared (saved on the lot)', (await grid(lotB.id)).hiddenColumns.includes('place'));

    console.log('excel import');
    const codes = (await grid(lotB.id)).items.map((i) => i.code);
    const rows: ImportBody['rows'] = [
      { code: codes[0]!, cells: { 'Details|Place': 'Pune', 'Details|Date': '1999', 'Decision|Remark': 'x' } },
      { code: codes[1]!, cells: { 'Details|Date': '99/99/1999' } },
      { code: 'NOPE-0000-0001-R-000', cells: { 'Details|Place': 'x' } },
    ];
    const pv = await importItems(lotB.id, { apply: false, rows }, admin);
    check('preview reports a bad cell and an unknown code', pv.errors.length === 1 && pv.unknownCodes.length === 1 && !pv.applied, pv);
    const ok = await importItems(lotB.id, { apply: true, rows: [rows[0]!] }, admin);
    check('import applies', ok.applied && ok.willChange === 1, ok);
    const imported = (await grid(lotB.id)).items.find((i) => i.code === codes[0])!;
    check('imported cells saved', imported.place === 'Pune' && imported.dateRange === '01/01/1999 - 31/12/1999', imported);

    console.log('intake assignment');
    const base = {
      dateReceived: new Date().toISOString(),
      originSource: sample.originSource!,
      owner: { name: 'Verify Owner' },
      pointsOfContact: [],
      mediaLines: [{ format: 'photo', dataType: sample.dataType, mediaSubtype: sample.mediaSubtype, quantity: 1 }],
    };
    const me = String(u._id);
    const owned = await createIntake({ ...base, assigneeId: me }, admin);
    created.push(owned.id);
    const ownedLot = await ArchiveLot.findById(owned.id).select('assignee assigneeName').lean();
    check('intake with an owner assigns the lot', String(ownedLot?.assignee) === me && Boolean(ownedLot?.assigneeName), ownedLot);
    check('no task without task details', (await Task.countDocuments({ lot: owned.id })) === 0);

    const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const tasked = await createIntake({ ...base, assigneeId: me, task: { checklist: ['Sort photos'], priority: 'urgent', dueDate: day, assigneeIds: [me] } }, admin);
    created.push(tasked.id);
    const t = await Task.findOne({ lot: tasked.id }).lean();
    check('intake with a task creates it linked to the lot', Boolean(t) && String(t!.lot) === tasked.id && t!.format === 'photo', t?.title);

    const before = await ArchiveLot.countDocuments({});
    await rejects('a past due date is refused', () => createIntake({ ...base, assigneeId: me, task: { checklist: [], priority: 'normal', dueDate: '2020-01-01', assigneeIds: [me] } }, admin), 400);
    await rejects('a task without an owner is refused', () => createIntake({ ...base, task: { checklist: [], priority: 'normal', assigneeIds: [me] } }, admin), 400);
    await rejects('an unknown user is refused', () => createIntake({ ...base, assigneeId: '0'.repeat(24) }, admin), 400);
    const noAssign: MutationContext = { ...admin, grants: admin.grants.filter((g) => g !== 'project:assign') };
    await rejects('assigning needs project:assign', () => createIntake({ ...base, assigneeId: me }, noAssign), 403);
    const noTask: MutationContext = { ...admin, grants: admin.grants.filter((g) => g !== 'task:assign') };
    await rejects('a task needs task:assign', () => createIntake({ ...base, assigneeId: me, task: { checklist: [], priority: 'normal', assigneeIds: [me] } }, noTask), 403);
    check('refused intakes create nothing', (await ArchiveLot.countDocuments({})) === before);

    console.log('lot photos');
    const imgs = await listLotImages(owned.id, admin);
    check('a new lot has no photos and the admin may manage them', imgs.images.length === 0 && imgs.can.manage === true, imgs);
    const otherUser = await User.findOne({ _id: { $ne: u._id } }).select('_id').lean();
    const viewerOnly: MutationContext = { userId: otherUser ? String(otherUser._id) : '0'.repeat(24), userName: 'Viewer', roleKey: 'test', grants: ['lot:view', 'lot:edit'] };
    check('an assigned lot cannot be managed by a non-assignee without project:assign', (await listLotImages(owned.id, viewerOnly)).can.manage === false);
    await rejects('a non-assignee cannot delete a photo', () => deleteLotImage(owned.id, '0'.repeat(24), viewerOnly), 403);
    await rejects('deleting a missing photo is a 404', () => deleteLotImage(owned.id, '0'.repeat(24), admin), 404);
    await rejects('an unknown lot is a 404', () => listLotImages('0'.repeat(24), admin), 404);

    console.log('prasadi');
    const prs = await createIntake(
      {
        dateReceived: new Date().toISOString(),
        originSource: sample.originSource!,
        owner: { name: 'Verify Owner' },
        pointsOfContact: [],
        mediaLines: [{ format: 'prasadi', dataType: 'physical', mediaSubtype: 'Prasadi', quantity: 2 }],
      },
      admin,
    );
    created.push(prs.id);
    const pg = await grid(prs.id);
    const [p1, p2] = pg.items.map((i) => i.id) as [string, string];
    check('prasadi items start decided as keep physical', pg.items.length === 2 && pg.items.every((i) => i.result === 'physical' && i.format === 'prasadi'), pg.items.map((i) => i.result));
    check('prasadi summary: all decided, none to digitize', pg.summary.decided === 2 && pg.summary.archive === 0 && pg.summary.physical === 2, pg.summary);

    await bulkUpdateItems(prs.id, { itemIds: [p1], set: { itemName: 'Mala', attrs: { blessedBy: 'Pramukh Swami Maharaj', stickerApplied: true }, remarks: 'wooden beads' } }, admin);
    const pa = (await grid(prs.id)).items.find((i) => i.id === p1)!;
    check('prasadi details and attrs saved', pa.itemName === 'Mala' && pa.attrs.blessedBy === 'Pramukh Swami Maharaj' && pa.attrs.stickerApplied === true, pa.attrs);
    const pl = await ArchiveLot.findById(prs.id).select('stage decision.status').lean();
    check('a Prasadi lot is decided by its first edit and moves to storage', pl?.decision?.status === 'archive' && pl.stage === 'storage', [pl?.stage, pl?.decision?.status]);
    await rejects('unknown attr column refused', () => bulkUpdateItems(prs.id, { itemIds: [p1], set: { attrs: { nope: 'x' } } }, admin), 400);

    await bulkUpdateItems(prs.id, { itemIds: [p1, p2], set: { recheckWeeks: 3 } }, admin);
    const pw = (await grid(prs.id)).items.find((i) => i.id === p1)!;
    check('re-check in 3 weeks sets the due date 21 days ahead', pw.recheckWeeks === 3 && pw.nextCheckDue === isoToDmy(nextCheckDate(new Date(), 3)), [pw.recheckWeeks, pw.nextCheckDue]);
    check('nothing is due yet', (await listPrasadiChecks({ page: 1, pageSize: 50 }, new Date())).rows.every((r) => r.lotId !== prs.id));

    const later = new Date(Date.now() + 22 * 86_400_000);
    const due = await listPrasadiChecks({ page: 1, pageSize: 50 }, later);
    const mine = due.rows.filter((r) => r.lotId === prs.id);
    check('after 3 weeks both items are due, with name and Guru', mine.length === 2 && mine.some((r) => r.itemName === 'Mala' && r.blessedBy === 'Pramukh Swami Maharaj'), mine);

    const marked = await markPrasadiChecked({ itemIds: [p1], result: 'needs_care', note: 'faded', nextWeeks: 2 }, admin, later);
    const pc = (await grid(prs.id)).items.find((i) => i.id === p1)!;
    check('mark checked: condition, last checked and next check', marked.updated === 1 && pc.itemCondition === 'Needs care' && pc.recheckWeeks === 2 && pc.lastCheckedAt === isoToDmy(later) && pc.nextCheckDue === isoToDmy(nextCheckDate(later, 2)), pc);
    await markPrasadiChecked({ itemIds: [p2], result: 'good', nextWeeks: null }, admin, later);
    const pn = (await grid(prs.id)).items.find((i) => i.id === p2)!;
    check('an empty next-weeks box stops the reminder', pn.recheckWeeks === null && pn.nextCheckDue === '' && pn.itemCondition === 'Good', pn);
    check('the lot leaves the queue once checked', (await listPrasadiChecks({ page: 1, pageSize: 50 }, later)).rows.every((r) => r.lotId !== prs.id));
    await rejects('only Prasadi items can be checked', () => markPrasadiChecked({ itemIds: [a], result: 'good', nextWeeks: null }, admin), 404);

    // A recheck on a non-Prasadi item is ignored (a mixed bulk selection must not mark photos).
    await bulkUpdateItems(lot.id, { itemIds: [a], set: { recheckWeeks: 4 } }, admin);
    check('recheck weeks never lands on a non-Prasadi item', (await grid(lot.id)).items.find((i) => i.id === a)!.recheckWeeks === null);
  } finally {
    await Task.deleteMany({ lot: { $in: created } });
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
