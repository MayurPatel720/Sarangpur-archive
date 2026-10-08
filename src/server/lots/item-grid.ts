import { Types, type AnyBulkWriteOperation } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { intakeMissing } from '@/lib/intake-gate';
import { formatDateRange, isoDayToDmy, parseDateRange } from '@/lib/date-range';
import { itemResultOf, type ItemAnswers, type Tri } from '@/lib/item-decision';
import type { ActivityKind } from '@/lib/domain';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem, type LotItemDoc } from '@/models/LotItem';
import { withAudit, auditActor } from '@/server/audit';
import { mediaSubtypeListKeyAsync } from '@/server/lots/queries';
import { getReferenceList } from '@/server/reference';
import { canWorkLot } from '@/server/lots/access';
import { can } from '@/server/permissions';
import { finalizeItemDecisions } from '@/server/lots/mutations';
import type {
  GridItem,
  ItemDispositionDoneBody,
  ItemDispositionList,
  ItemDispositionQuery,
  ItemsBulkBody,
  ItemsBulkResponse,
  ItemsGridResponse,
  ItemsSummary,
} from '@/types/items';

/**
 * The lot's Excel (Items tab): per-item details, decisions, digitization / storage and
 * logging. Columns: src/lib/item-columns.ts.
 *
 * Decision (digital / redigital / discard, each Yes / No / unanswered) turns into one
 * result per item with `itemResultOf`. When the last item of a lot is decided (and the
 * lot's intake details are complete) the lot is decided automatically via
 * `finalizeItemDecisions`; after that, capture / MLS / logging ticks move the lot through
 * its stages (`syncLotStage`).
 *
 * `disposition` (Excel "return / discard") is the physical item's final fate and feeds the
 * Returns / Discards queues. It stays in step with the Decision "discard" answer:
 * discard = Yes ⇒ Discard, and choosing Discard here answers discard = Yes.
 */

const DECISION_KEYS = ['digital', 'redigital', 'discard'] as const;

/** Plain text columns: grid key → LotItem field. */
const TEXT_FIELDS: Record<string, string> = {
  senderCode: 'senderCode',
  place: 'place',
  nameOnTape: 'nameOnTape',
  nameOnCase: 'nameOnCase',
  physicalSource: 'physicalSource',
  remarks: 'remarks',
  digitalSource: 'digitalSource',
  fileName: 'fileName',
  phyStorageLoc: 'phyStorageLoc',
  storageRemark: 'storageRemark',
  loggerName: 'loggerName',
};

/** The grid is read-only once the lot has been returned or discarded. */
export const gridLocked = (stage: string): boolean => stage === 'returned' || stage === 'discarded';

export type ItemLean = LotItemDoc & { _id: Types.ObjectId };

function answersOf(it: ItemLean): ItemAnswers {
  const d = (it.decision ?? {}) as Record<string, unknown>;
  return {
    digital: (d.digital as Tri) ?? null,
    redigital: (d.redigital as Tri) ?? null,
    discard: (d.discard as Tri) ?? null,
  };
}

async function summarise(lotId: Types.ObjectId): Promise<ItemsSummary> {
  const isBool = (path: string) => ({ $in: [{ $ifNull: [path, null] }, [true, false]] });
  const [row] = await LotItem.aggregate<{ total: number; decided: number; archive: number; discard: number; physical: number }>([
    { $match: { lot: lotId } },
    {
      $project: {
        decided: { $and: [isBool('$decision.digital'), isBool('$decision.redigital'), isBool('$decision.discard')] },
        digitize: { $or: [{ $eq: ['$decision.digital', true] }, { $eq: ['$decision.redigital', true] }] },
        discard: { $eq: ['$decision.discard', true] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        decided: { $sum: { $cond: ['$decided', 1, 0] } },
        archive: { $sum: { $cond: [{ $and: ['$decided', '$digitize'] }, 1, 0] } },
        discard: { $sum: { $cond: [{ $and: ['$decided', { $not: ['$digitize'] }, '$discard'] }, 1, 0] } },
        physical: { $sum: { $cond: [{ $and: ['$decided', { $not: ['$digitize'] }, { $not: ['$discard'] }] }, 1, 0] } },
      },
    },
  ]);
  return row
    ? { total: row.total, decided: row.decided, archive: row.archive, discard: row.discard, physical: row.physical }
    : { total: 0, decided: 0, archive: 0, discard: 0, physical: 0 };
}

interface LotGate {
  stage: string;
  decision?: { status?: string | null; overrideStatus?: string | null } | null;
  dateReceived?: Date | null;
  originSource?: string | null;
  owner?: { name?: string | null } | null;
  assignee?: unknown;
  syncProjectId?: unknown;
}

/** Item decisions are open before the lot is decided, or again after an approved override. */
const decisionOpen = (lot: LotGate) =>
  ((lot.stage === 'intake' || lot.stage === 'decision') && (lot.decision?.status ?? 'pending') === 'pending') ||
  (lot.decision?.overrideStatus === 'approved' && !gridLocked(lot.stage));

function blockedBy(lot: LotGate, summary: ItemsSummary): string[] {
  if (!decisionOpen(lot) || summary.total === 0 || summary.decided < summary.total) return [];
  const missing = intakeMissing(lot);
  return missing.length ? [`Fill in ${missing.join(', ')} on the lot before it can move on.`] : [];
}

const isoDay = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** What a row needs to know about its lot (resolved once per lot, never per item). */
export interface RowLotInfo {
  format: string;
  dataType: string;
  mediaSubtype: string;
  lines: { format: string; dataType: string; mediaSubtype: string }[];
  labelByLine: string[];
  duplicatedBy: string[];
}

/** One LotItem document → the row the lot Excel and the Master Excel both show. */
export function toGridRow(it: ItemLean, lot: RowLotInfo): GridItem {
  const a = answersOf(it);
  const line = lot.lines[it.lineIndex ?? 0];
  const dec = (it.decision ?? {}) as { remark?: string | null; disposition?: 'return' | 'discard' | null };
  return {
      id: String(it._id),
      code: it.code,
      groupNo: it.groupNo,
      itemNo: it.itemNo,
      lineIndex: it.lineIndex ?? 0,
      sortOrder: it.sortOrder ?? 0,
      format: line?.format ?? lot.format,
      dataType: line?.dataType ?? lot.dataType,
      subtypeLabel: lot.labelByLine[it.lineIndex ?? 0] ?? lot.mediaSubtype,
      senderCode: it.senderCode ?? null,
      dateRange: formatDateRange(isoDay(it.dateFrom), isoDay(it.dateTo)),
      place: it.place ?? null,
      nameOnTape: it.nameOnTape ?? null,
      nameOnCase: it.nameOnCase ?? null,
      physicalSource: it.physicalSource ?? null,
      remarks: it.remarks ?? null,
      duplicateCode: it.duplicateCode ?? null,
      duplicatedBy: lot.duplicatedBy,
      digital: a.digital,
      redigital: a.redigital,
      discard: a.discard,
      decisionRemark: dec.remark ?? null,
      result: itemResultOf(a),
      captured: Boolean(it.digitized),
      digitalSource: it.digitalSource ?? null,
      fileName: it.fileName ?? null,
      phyStorageLoc: it.phyStorageLoc ?? null,
      disposition: dec.disposition ?? null,
      dispositionStatus: (it.dispositionStatus as 'pending' | 'done' | null) ?? null,
      taggedInMls: Boolean(it.taggedInMls),
      storageRemark: it.storageRemark ?? null,
      logged: Boolean(it.logged),
      loggedAt: isoDayToDmy(isoDay(it.loggedAt)),
      loggerName: it.loggerName ?? null,
      custom: (it.custom ?? {}) as GridItem['custom'],
    };
}

/* --------------------------------------------------------------------- read */

export async function getItemsGrid(
  lotId: string,
  viewer: { userId: string; grants: string[] },
): Promise<ItemsGridResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const lot = await ArchiveLot.findById(lotId).lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  const items = (await LotItem.find({ lot: lot._id })
    .sort({ sortOrder: 1, groupNo: 1, itemNo: 1 })
    .limit(20000)
    .lean()) as ItemLean[];

  // Sub-type label per media line (each list read once).
  const lines = (lot.mediaLines ?? []) as { format: string; dataType: string; mediaSubtype: string }[];
  const labelByLine = await Promise.all(
    lines.map(async (l) => {
      const key = await mediaSubtypeListKeyAsync(l.format);
      if (!key) return l.mediaSubtype;
      const list = await getReferenceList(key);
      return list.find((i) => i.value === l.mediaSubtype)?.label ?? l.mediaSubtype;
    }),
  );

  // Back-links: items (any lot) that are duplicates of an item shown here. Read-time only —
  // the original's row is never written to, so a finished lot stays untouched.
  const duplicates = await LotItem.find({ duplicateCode: { $in: items.map((i) => i.code) } })
    .select('code duplicateCode')
    .lean();
  const dupOf = new Map<string, string[]>();
  for (const d of duplicates) {
    const k = String(d.duplicateCode);
    dupOf.set(k, [...(dupOf.get(k) ?? []), d.code]);
  }

  const rows: GridItem[] = items.map((it) =>
    toGridRow(it, {
      format: lot.format,
      dataType: lot.dataType,
      mediaSubtype: lot.mediaSubtype,
      lines,
      labelByLine,
      duplicatedBy: dupOf.get(it.code) ?? [],
    }),
  );

  const summary = await summarise(lot._id);
  const works =
    can(viewer.grants, 'lot:edit') &&
    canWorkLot(lot, { id: viewer.userId, grants: viewer.grants }) &&
    !gridLocked(lot.stage);
  return {
    items: rows,
    summary,
    version: lot.__v ?? 0,
    stage: lot.stage,
    editable: { details: works, decision: works && decisionOpen(lot) },
    blockedBy: blockedBy(lot, summary),
    hiddenColumns: lot.hiddenColumns ?? [],
    customColumns: (lot.customColumns ?? []).map((c) => ({ key: c.key, label: c.label, type: c.type, dept: c.dept })),
  };
}

/* -------------------------------------------------------------------- write */

const clean = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v);

export interface ItemEdit {
  id: string;
  set: Record<string, unknown>;
}

type EditAudit = { kind?: ActivityKind; title?: string; detail?: string };

/** Same values on many items — the grid's own save and its bulk bar. */
export async function bulkUpdateItems(
  lotId: string,
  body: ItemsBulkBody,
  ctx: MutationContext,
): Promise<ItemsBulkResponse> {
  const ids = [...new Set(body.itemIds)];
  return applyItemEdits(lotId, ids.map((id) => ({ id, set: { ...(body.set as Record<string, unknown>) } })), ctx);
}

/**
 * Applies per-item edits in ONE audited transaction (grid save, bulk bar and the Excel
 * import all come through here), then lets the lot move on: decides it when the last item
 * is decided, and keeps its stage in step with capture / MLS / logging.
 */
export async function applyItemEdits(
  lotId: string,
  edits: ItemEdit[],
  ctx: MutationContext,
  audit: EditAudit = {},
): Promise<ItemsBulkResponse> {
  for (const e of edits) for (const k of Object.keys(e.set)) if (k !== 'custom') e.set[k] = clean(e.set[k]);

  const keys = new Set(edits.flatMap((e) => Object.keys(e.set)));
  const touchesDecision = DECISION_KEYS.some((k) => keys.has(k));
  const ids = edits.map((e) => new Types.ObjectId(e.id));
  const n = ids.length;

  await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: audit.kind ?? 'items_updated',
    title: audit.title ?? (n === 1 ? 'Item updated' : `${n} items updated`),
    detail: audit.detail ?? `Fields: ${[...keys].join(', ')}`,
    mutate: async (lot, session) => {
      if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      if (touchesDecision && !decisionOpen(lot)) {
        throw new HttpError(400, 'Decisions are locked — this lot has already been decided. Request an override to revisit it.');
      }
      const items = (await LotItem.find({ _id: { $in: ids }, lot: lot._id }).session(session).lean()) as ItemLean[];
      if (items.length !== ids.length) throw new HttpError(404, 'Some items do not belong to this lot.');
      const byId = new Map(items.map((i) => [String(i._id), i]));
      const customDefs = new Map((lot.customColumns ?? []).map((c) => [c.key, c]));

      const now = new Date();
      const ops: AnyBulkWriteOperation[] = [];
      for (const edit of edits) {
        const it = byId.get(edit.id)!;
        const set = edit.set;
        const fail = (msg: string): never => {
          throw new HttpError(400, `${it.code}: ${msg}`);
        };
        const $set: Record<string, unknown> = {};
        const $unset: Record<string, ''> = {};

        for (const [key, field] of Object.entries(TEXT_FIELDS)) if (key in set) $set[field] = set[key] ?? null;

        if ('dateRange' in set) {
          if (set.dateRange === null) {
            $set.dateFrom = null;
            $set.dateTo = null;
          } else {
            const r = parseDateRange(String(set.dateRange));
            if (!r.ok) fail(`Date: ${r.error}`);
            else {
              $set.dateFrom = new Date(`${r.from}T00:00:00.000Z`);
              $set.dateTo = new Date(`${r.to}T00:00:00.000Z`);
            }
          }
        }
        if ('captured' in set) $set.digitized = Boolean(set.captured);
        if ('taggedInMls' in set) $set.taggedInMls = Boolean(set.taggedInMls);

        // Logging: ticking Status stamps who and when (still editable afterwards).
        if ('logged' in set) {
          const on = Boolean(set.logged);
          $set.logged = on;
          if (on) {
            if (!('loggedAt' in set) && !it.loggedAt) $set.loggedAt = now;
            if (!('loggerName' in set) && !it.loggerName) $set.loggerName = ctx.userName;
          } else {
            if (!('loggedAt' in set)) $set.loggedAt = null;
            if (!('loggerName' in set)) $set.loggerName = null;
          }
        }
        if ('loggedAt' in set) {
          if (set.loggedAt === null) $set.loggedAt = null;
          else {
            const r = parseDateRange(String(set.loggedAt));
            if (!r.ok) fail(`Logging date: ${r.error}`);
            else $set.loggedAt = new Date(`${r.from}T00:00:00.000Z`);
          }
        }

        // Custom columns.
        const custom = (set.custom ?? {}) as Record<string, unknown>;
        for (const [ck, raw] of Object.entries(custom)) {
          const def = customDefs.get(ck);
          if (!def) fail('Unknown column.');
          const v = typeof raw === 'string' ? clean(raw) : raw;
          if (v === null || v === undefined) {
            $unset[`custom.${ck}`] = '';
            continue;
          }
          if (def!.type === 'number') {
            const num = typeof v === 'number' ? v : Number(v);
            if (!Number.isFinite(num)) fail(`${def!.label} must be a number.`);
            $set[`custom.${ck}`] = num;
          } else if (def!.type === 'yesno') {
            if (typeof v !== 'boolean') fail(`${def!.label} must be Yes or No.`);
            $set[`custom.${ck}`] = v;
          } else if (def!.type === 'date') {
            const r = parseDateRange(String(v));
            if (!r.ok) fail(`${def!.label}: ${r.error}`);
            else $set[`custom.${ck}`] = r.from;
          } else {
            $set[`custom.${ck}`] = String(v).slice(0, 2000);
          }
        }

        // Decision + disposition.
        const before = answersOf(it);
        const beforeDec = (it.decision ?? {}) as { disposition?: 'return' | 'discard' | null };
        const beforeDisp = beforeDec.disposition ?? null;
        const next: ItemAnswers = {
          digital: 'digital' in set ? (set.digital as Tri) : before.digital,
          redigital: 'redigital' in set ? (set.redigital as Tri) : before.redigital,
          discard: 'discard' in set ? (set.discard as Tri) : before.discard,
        };
        let disp: 'return' | 'discard' | null = 'disposition' in set ? (set.disposition as 'return' | 'discard' | null) : beforeDisp;
        if ('disposition' in set) {
          if (disp === 'discard') next.discard = true;
          else if (disp === 'return') next.discard = false;
          else if (beforeDisp === 'discard' && !('discard' in set)) next.discard = null;
        } else if ('discard' in set) {
          if (next.discard === true) disp = 'discard';
          else if (disp === 'discard') disp = null;
        }
        if (disp !== beforeDisp && it.dispositionStatus === 'done') {
          fail('This item was already marked returned / discarded in the queue — it can no longer change.');
        }
        const decisionTouched = DECISION_KEYS.some((k) => k in set) || 'disposition' in set;
        if (decisionTouched) {
          const result = itemResultOf(next);
          const wasFinal = itemResultOf(before) !== null;
          $set['decision.digital'] = next.digital;
          $set['decision.redigital'] = next.redigital;
          $set['decision.discard'] = next.discard;
          $set['decision.disposition'] = disp;
          // Legacy verdict mirror so old guards ("items already decided") keep working.
          $set['decision.verdict'] = result === null ? null : result === 'archive' ? 'archive' : 'return_or_discard';
          if (result !== null) {
            $set.selectedForDigitization = result === 'archive';
            if (result === 'archive') $set.notDigitizedReason = null;
            if (!wasFinal) {
              $set['decision.decidedBy'] = new Types.ObjectId(ctx.userId);
              $set['decision.decidedAt'] = now;
            }
          } else {
            $set['decision.decidedBy'] = null;
            $set['decision.decidedAt'] = null;
          }
          // Queue entry: pending while a return / discard is chosen, gone when it is cleared.
          if (disp && it.dispositionStatus !== 'done') $set.dispositionStatus = 'pending';
          if (!disp && it.dispositionStatus === 'pending') $set.dispositionStatus = null;
        }
        if ('decisionRemark' in set) $set['decision.remark'] = set.decisionRemark ?? null;

        if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) continue;
        ops.push({
          updateOne: {
            filter: { _id: it._id },
            update: { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
          },
        });
      }
      for (let i = 0; i < ops.length; i += 1000) {
        await LotItem.bulkWrite(ops.slice(i, i + 1000), { session });
      }

      // Denormalised progress counters (rule 4: no counting on read paths).
      const [expected, found] = await Promise.all([
        LotItem.countDocuments({ lot: lot._id, selectedForDigitization: true }).session(session),
        LotItem.countDocuments({ lot: lot._id, selectedForDigitization: true, digitized: true }).session(session),
      ]);
      lot.set('digitization.expectedFileCount', expected);
      lot.set('digitization.foundFileCount', found);
      return null;
    },
  });

  const lot = await ArchiveLot.findById(lotId).lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  let summary = await summarise(lot._id);
  let finalized: ItemsBulkResponse['finalized'] = null;
  const blocked = blockedBy(lot, summary);
  if (touchesDecision && decisionOpen(lot) && summary.total > 0 && summary.decided === summary.total && blocked.length === 0) {
    const out = await finalizeItemDecisions(lotId, ctx);
    finalized = { decision: out.decision, stage: out.stage };
    summary = await summarise(lot._id);
  }
  await syncLotStage(lotId, ctx);
  return { updated: n, summary, finalized, blockedBy: blocked };
}

/**
 * Keeps an archived lot's stage in step with its items, so nobody has to press a stage
 * button: first capture ⇒ scanning · every item to digitize captured ⇒ mls_tag · all of
 * those tagged in MLS and every row logged ⇒ storage. Moves backwards too when a tick is
 * undone. Only lots decided "archive" and not yet returned / discarded are touched.
 */
export async function syncLotStage(lotId: string, ctx: MutationContext): Promise<void> {
  await connectToDatabase();
  const lot = await ArchiveLot.findById(lotId).select('stage decision.status').lean();
  if (!lot || lot.decision?.status !== 'archive') return;
  if (!['metadata', 'scanning', 'mls_tag', 'storage'].includes(lot.stage)) return;

  const [row] = await LotItem.aggregate<{ total: number; logged: number; dig: number; captured: number; tagged: number }>([
    { $match: { lot: new Types.ObjectId(lotId) } },
    {
      $project: {
        logged: { $cond: [{ $eq: ['$logged', true] }, 1, 0] },
        dig: { $cond: [{ $eq: ['$selectedForDigitization', true] }, 1, 0] },
        captured: { $cond: [{ $and: [{ $eq: ['$selectedForDigitization', true] }, { $eq: ['$digitized', true] }] }, 1, 0] },
        tagged: { $cond: [{ $and: [{ $eq: ['$selectedForDigitization', true] }, { $eq: ['$taggedInMls', true] }] }, 1, 0] },
      },
    },
    { $group: { _id: null, total: { $sum: 1 }, logged: { $sum: '$logged' }, dig: { $sum: '$dig' }, captured: { $sum: '$captured' }, tagged: { $sum: '$tagged' } } },
  ]);
  if (!row || row.total === 0) return;

  let target = lot.stage;
  if (row.dig > 0) {
    if (row.captured === row.dig && row.tagged === row.dig && row.logged === row.total) target = 'storage';
    else if (row.captured === row.dig) target = 'mls_tag';
    else if (row.captured > 0) target = 'scanning';
    else target = 'metadata';
  } else {
    // Nothing to digitize: the lot sits in storage (physical items are kept / returned / discarded one by one).
    target = 'storage';
  }
  if (target === lot.stage) return;

  await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'items_updated',
    title: `Stage updated from the Excel — ${target}`,
    detail: `Items to digitize ${row.dig}, captured ${row.captured}, tagged ${row.tagged}, logged ${row.logged} of ${row.total}.`,
    mutate: async (l) => {
      if (l.stage !== lot.stage) return null; // someone else moved it meanwhile
      l.stage = target as typeof l.stage;
      return null;
    },
  });
}

/* ------------------------------------------- item return / discard queues */

export async function listItemDispositions(query: ItemDispositionQuery): Promise<ItemDispositionList> {
  await connectToDatabase();
  const filter = { 'decision.disposition': query.kind, dispositionStatus: query.status };
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    LotItem.find(filter)
      .sort(query.status === 'pending' ? { 'decision.decidedAt': 1 } : { dispositionDoneAt: -1 })
      .skip(skip)
      .limit(query.pageSize)
      .lean(),
    LotItem.countDocuments(filter),
  ]);
  return {
    rows: (docs as ItemLean[]).map((d) => {
      const dec = (d.decision ?? {}) as { decidedAt?: Date | null; digital?: boolean | null; redigital?: boolean | null };
      const digitizeFirst = dec.digital === true || dec.redigital === true;
      return {
        id: String(d._id),
        code: d.code,
        place: d.place ?? null,
        lotId: String(d.lot),
        lotReference: d.lotReference ?? '',
        waitingForCapture: digitizeFirst && !d.digitized,
        decidedAt: dec.decidedAt ? new Date(dec.decidedAt).toISOString() : null,
        doneAt: d.dispositionDoneAt ? new Date(d.dispositionDoneAt).toISOString() : null,
        doneByName: d.dispositionDoneByName ?? null,
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Mark item returns/discards done — one audited write per lot touched. An item that must be
 * digitized first can only be marked once its file is captured. When that leaves a lot
 * with nothing to digitize and every item handled, the lot becomes returned / discarded.
 */
export async function markItemDispositionsDone(
  body: ItemDispositionDoneBody,
  ctx: MutationContext,
): Promise<{ updated: number }> {
  await connectToDatabase();
  const ids = body.itemIds.map((id) => new Types.ObjectId(id));
  const items = await LotItem.find({
    _id: { $in: ids },
    'decision.disposition': body.kind,
    dispositionStatus: 'pending',
  })
    .select('lot code digitized decision')
    .lean();
  const waiting = (items as ItemLean[]).filter((it) => {
    const d = (it.decision ?? {}) as { digital?: boolean | null; redigital?: boolean | null };
    return (d.digital === true || d.redigital === true) && !it.digitized;
  });
  if (waiting.length > 0) {
    throw new HttpError(
      400,
      `${waiting.length === 1 ? waiting[0]!.code : `${waiting.length} items`} must be digitized (captured) before the physical copy is ${body.kind === 'return' ? 'returned' : 'discarded'}.`,
    );
  }
  const byLot = new Map<string, Types.ObjectId[]>();
  for (const it of items) {
    const k = String(it.lot);
    byLot.set(k, [...(byLot.get(k) ?? []), it._id as Types.ObjectId]);
  }
  let updated = 0;
  for (const [lot, itemIds] of byLot) {
    await withAudit({
      lotId: lot,
      actor: auditActor(ctx),
      kind: body.kind === 'return' ? 'return_completed' : 'discard_confirmed',
      title: `${itemIds.length} ${itemIds.length === 1 ? 'item' : 'items'} ${body.kind === 'return' ? 'returned' : 'discarded'}`,
      mutate: async (_lot, session) => {
        const res = await LotItem.updateMany(
          { _id: { $in: itemIds }, dispositionStatus: 'pending' },
          { $set: { dispositionStatus: 'done', dispositionDoneAt: new Date(), dispositionDoneByName: ctx.userName } },
          { session },
        );
        updated += res.modifiedCount;
        return null;
      },
    });
    await finishLotIfHandled(lot, ctx);
  }
  return { updated };
}

/** A lot with nothing to digitize whose every item has been returned / discarded is finished. */
async function finishLotIfHandled(lotId: string, ctx: MutationContext): Promise<void> {
  const lotObjectId = new Types.ObjectId(lotId);
  const [total, digitize, open, returned] = await Promise.all([
    LotItem.countDocuments({ lot: lotObjectId }),
    LotItem.countDocuments({ lot: lotObjectId, $or: [{ 'decision.digital': true }, { 'decision.redigital': true }] }),
    LotItem.countDocuments({ lot: lotObjectId, dispositionStatus: { $ne: 'done' } }),
    LotItem.countDocuments({ lot: lotObjectId, 'decision.disposition': 'return', dispositionStatus: 'done' }),
  ]);
  if (total === 0 || digitize > 0 || open > 0) return;
  const stage = returned > 0 ? 'returned' : 'discarded';
  await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: stage === 'returned' ? 'return_completed' : 'discard_confirmed',
    title: stage === 'returned' ? 'Every item returned' : 'Every item discarded',
    mutate: async (lot) => {
      if (gridLocked(lot.stage)) return null;
      if (stage === 'returned') {
        lot.set('return.status', 'returned');
        lot.set('return.returnedAt', new Date());
      } else {
        lot.set('discard.reason', 'other');
        lot.set('discard.discardedBy', new Types.ObjectId(ctx.userId));
        lot.set('discard.discardedAt', new Date());
      }
      lot.stage = stage;
      return null;
    },
  });
}
