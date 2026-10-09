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
import type { MutationContext } from '../src/lib/api';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { bulkUpdateItems, getItemsGrid, listItemDispositions, markItemDispositionsDone } from '../src/server/lots/item-grid';
import { markDuplicate, recodeSheet, reorderItems, setItemNumber, updateColumns } from '../src/server/lots/item-codes';
import { importItems } from '../src/server/lots/item-import';
import { parseDateRange, formatDateRange } from '../src/lib/date-range';
import { itemResultOf } from '../src/lib/item-decision';
import { buildItemCode, parseItemCodeParts } from '../src/lib/item-code';
import type { GridItem, ImportBody } from '../src/types/items';
import { allColumns } from '../src/lib/item-columns';
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
    loggerName: null, custom: {}, ...over,
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
