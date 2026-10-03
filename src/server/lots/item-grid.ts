import { Types, type AnyBulkWriteOperation } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { intakeMissing } from '@/lib/intake-gate';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem, type LotItemDoc } from '@/models/LotItem';
import { withAudit, auditActor } from '@/server/audit';
import { assertActiveReferenceValue, getReferenceList } from '@/server/reference';
import { mediaSubtypeListKeyAsync, isTerminalStage } from '@/server/lots/queries';
import { canWorkLot } from '@/server/lots/access';
import { computeVerdict } from '@/server/lots/decision-rule';
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
 * The Items grid: per-item details and per-item decisions.
 *
 * Decision answers are three-state (true / false / null). The verdict is computed
 * here with the SAME rule as the lot checklist (`computeVerdict`), one item at a
 * time, with "Significant?" as that item's single significance answer. An item's
 * final result is `archive`, or `return` / `discard` once a disposition is chosen.
 *
 * When the last item of a lot gets its final result (and the lot's intake details
 * are complete), the lot is decided automatically via `finalizeItemDecisions`:
 * any archived item → the lot is archived and moves on to digitization with only
 * those items; the rest are queued item by item in Returns / Discards.
 */

const DECISION_KEYS = [
  'existsInMls',
  'newCopyIsBetter',
  'conditionUsable',
  'significant',
  'disposition',
  'reason',
] as const;
const DETAIL_KEYS = [
  'name',
  'nameOnCase',
  'description',
  'year',
  'month',
  'place',
  'event',
  'people',
  'physicalSource',
  'itemCondition',
  'remarks',
] as const;

type Tri = boolean | null;
interface ItemDecisionState {
  existsInMls: Tri;
  newCopyIsBetter: Tri;
  conditionUsable: Tri;
  significant: Tri;
  disposition: 'return' | 'discard' | null;
}

/** Per-item verdict, or null while any required question is unanswered. */
export function itemVerdict(d: ItemDecisionState): 'archive' | 'return_or_discard' | null {
  if (d.existsInMls === null || d.conditionUsable === null || d.significant === null) return null;
  if (d.existsInMls && d.newCopyIsBetter === null) return null;
  return computeVerdict({
    existsInMls: d.existsInMls,
    newCopyIsBetter: d.newCopyIsBetter ?? undefined,
    conditionUsable: d.conditionUsable,
    significanceFlags: [d.significant],
  });
}

export function itemResult(
  verdict: 'archive' | 'return_or_discard' | null,
  disposition: 'return' | 'discard' | null,
): 'archive' | 'return' | 'discard' | null {
  if (verdict === 'archive') return 'archive';
  if (verdict === 'return_or_discard' && disposition) return disposition;
  return null;
}

type ItemLean = LotItemDoc & { _id: Types.ObjectId };

function decisionOf(it: ItemLean): ItemDecisionState & { verdict: 'archive' | 'return_or_discard' | null } {
  const d = (it.decision ?? {}) as Record<string, unknown>;
  return {
    existsInMls: (d.existsInMls as Tri) ?? null,
    newCopyIsBetter: (d.newCopyIsBetter as Tri) ?? null,
    conditionUsable: (d.conditionUsable as Tri) ?? null,
    significant: (d.significant as Tri) ?? null,
    disposition: (d.disposition as 'return' | 'discard' | null) ?? null,
    verdict: (d.verdict as 'archive' | 'return_or_discard' | null) ?? null,
  };
}

async function summarise(lotId: Types.ObjectId): Promise<ItemsSummary> {
  const [row] = await LotItem.aggregate<{
    total: number;
    named: number;
    archive: number;
    ret: number;
    discard: number;
  }>([
    { $match: { lot: lotId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        named: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$name', ''] } }, 0] }, 1, 0] } },
        archive: { $sum: { $cond: [{ $eq: ['$decision.verdict', 'archive'] }, 1, 0] } },
        ret: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$decision.verdict', 'return_or_discard'] }, { $eq: ['$decision.disposition', 'return'] }] },
              1,
              0,
            ],
          },
        },
        discard: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$decision.verdict', 'return_or_discard'] }, { $eq: ['$decision.disposition', 'discard'] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  const r = row ?? { total: 0, named: 0, archive: 0, ret: 0, discard: 0 };
  return {
    total: r.total,
    named: r.named,
    decided: r.archive + r.ret + r.discard,
    archive: r.archive,
    return: r.ret,
    discard: r.discard,
  };
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
  (lot.decision?.overrideStatus === 'approved' && !isTerminalStage(lot.stage));

function blockedBy(lot: LotGate, summary: ItemsSummary): string[] {
  if (!decisionOpen(lot) || summary.total === 0 || summary.decided < summary.total) return [];
  const missing = intakeMissing(lot);
  return missing.length ? [`Fill in ${missing.join(', ')} on the lot before it can move on.`] : [];
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
  const items = (await LotItem.find({ lot: lot._id }).sort({ groupNo: 1, itemNo: 1 }).limit(20000).lean()) as ItemLean[];

  // Sub-type label per media line (each list read once).
  const lines = (lot.mediaLines ?? []) as { format: string; mediaSubtype: string }[];
  const labelByLine = await Promise.all(
    lines.map(async (l) => {
      const key = await mediaSubtypeListKeyAsync(l.format);
      if (!key) return l.mediaSubtype;
      const list = await getReferenceList(key);
      return list.find((i) => i.value === l.mediaSubtype)?.label ?? l.mediaSubtype;
    }),
  );

  const lateStage = lot.stage === 'mls_tag' || lot.stage === 'storage';
  const rows: GridItem[] = items.map((it) => {
    const d = decisionOf(it);
    const line = lines[it.lineIndex ?? 0];
    return {
      id: String(it._id),
      code: it.code,
      groupNo: it.groupNo,
      itemNo: it.itemNo,
      lineIndex: it.lineIndex ?? 0,
      format: line?.format ?? lot.format,
      subtypeLabel: labelByLine[it.lineIndex ?? 0] ?? lot.mediaSubtype,
      name: it.name ?? null,
      nameOnCase: it.nameOnCase ?? null,
      description: it.description ?? null,
      year: it.year ?? null,
      month: it.month ?? null,
      place: it.place ?? null,
      event: it.event ?? null,
      people: it.people ?? null,
      physicalSource: it.physicalSource ?? null,
      itemCondition: it.itemCondition ?? null,
      remarks: it.remarks ?? null,
      existsInMls: d.existsInMls,
      newCopyIsBetter: d.newCopyIsBetter,
      conditionUsable: d.conditionUsable,
      significant: d.significant,
      verdict: d.verdict,
      disposition: d.disposition,
      reason: it.notDigitizedReason ?? null,
      result: itemResult(d.verdict, d.disposition),
      dispositionStatus: (it.dispositionStatus as 'pending' | 'done' | null) ?? null,
      captureStatus: it.digitized
        ? 'captured'
        : lateStage && it.selectedForDigitization
          ? 'missing'
          : 'not_started',
      digitalSource: it.digitalSource ?? null,
      fileName: it.fileName ?? null,
      taggedInMls: it.taggedInMls,
      mlsDuplicateOf: it.mlsDuplicateOf ?? null,
    };
  });

  const summary = await summarise(lot._id);
  const works =
    can(viewer.grants, 'lot:edit') &&
    canWorkLot(lot, { id: viewer.userId, grants: viewer.grants }) &&
    !isTerminalStage(lot.stage);
  return {
    items: rows,
    summary,
    version: lot.__v ?? 0,
    stage: lot.stage,
    editable: { details: works, decision: works && decisionOpen(lot) },
    blockedBy: blockedBy(lot, summary),
  };
}

/* -------------------------------------------------------------------- write */

const clean = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v);

export async function bulkUpdateItems(
  lotId: string,
  body: ItemsBulkBody,
  ctx: MutationContext,
): Promise<ItemsBulkResponse> {
  const set = body.set as Record<string, unknown>;
  for (const k of Object.keys(set)) set[k] = clean(set[k]);
  // Admin-managed vocabularies — reject retired/unknown values before writing.
  await Promise.all([
    set.physicalSource ? assertActiveReferenceValue('physicalSource', set.physicalSource as string) : null,
    set.itemCondition ? assertActiveReferenceValue('itemCondition', set.itemCondition as string) : null,
    set.reason ? assertActiveReferenceValue('notDigitizedReason', set.reason as string) : null,
  ]);
  const touchesDecision = DECISION_KEYS.some((k) => k in set);
  const changed = [...DETAIL_KEYS, ...DECISION_KEYS].filter((k) => k in set);
  const ids = [...new Set(body.itemIds)].map((id) => new Types.ObjectId(id));

  await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'items_updated',
    title: ids.length === 1 ? 'Item updated' : `${ids.length} items updated`,
    detail: `Fields: ${changed.join(', ')}`,
    mutate: async (lot, session) => {
      if (isTerminalStage(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      if (touchesDecision && !decisionOpen(lot)) {
        throw new HttpError(400, 'Decisions are locked — this lot has already been decided. Request an override to revisit it.');
      }
      const items = (await LotItem.find({ _id: { $in: ids }, lot: lot._id }).session(session).lean()) as ItemLean[];
      if (items.length !== ids.length) throw new HttpError(404, 'Some items do not belong to this lot.');

      const now = new Date();
      const ops: AnyBulkWriteOperation[] = [];
      let unnamed = 0;
      for (const it of items) {
        const before = decisionOf(it);
        const next: ItemDecisionState = {
          existsInMls: 'existsInMls' in set ? (set.existsInMls as Tri) : before.existsInMls,
          newCopyIsBetter: 'newCopyIsBetter' in set ? (set.newCopyIsBetter as Tri) : before.newCopyIsBetter,
          conditionUsable: 'conditionUsable' in set ? (set.conditionUsable as Tri) : before.conditionUsable,
          significant: 'significant' in set ? (set.significant as Tri) : before.significant,
          disposition: 'disposition' in set ? (set.disposition as 'return' | 'discard' | null) : before.disposition,
        };
        if (next.existsInMls === false) next.newCopyIsBetter = null;
        const name = 'name' in set ? (set.name as string | null) : (it.name ?? null);
        const anyAnswer =
          next.existsInMls !== null || next.conditionUsable !== null || next.significant !== null || next.disposition !== null;
        if (anyAnswer && !name) unnamed += 1;

        const verdict = itemVerdict(next);
        const disposition = verdict === 'return_or_discard' ? next.disposition : null;
        const reasonIn = 'reason' in set ? (set.reason as string | null) : (it.notDigitizedReason ?? null);
        const reason = verdict === 'return_or_discard' ? reasonIn : null;
        const wasFinal = itemResult(before.verdict, before.disposition) !== null;
        const isFinal = itemResult(verdict, disposition) !== null;

        const $set: Record<string, unknown> = {};
        for (const k of DETAIL_KEYS) if (k in set) $set[k] = set[k];
        if (touchesDecision) {
          $set['decision.existsInMls'] = next.existsInMls;
          $set['decision.newCopyIsBetter'] = next.newCopyIsBetter;
          $set['decision.conditionUsable'] = next.conditionUsable;
          $set['decision.significant'] = next.significant;
          $set['decision.verdict'] = verdict;
          $set['decision.disposition'] = disposition;
          $set.notDigitizedReason = reason;
          // Archive keeps the item for digitization; return/discard drops it.
          if (verdict === 'archive') $set.selectedForDigitization = true;
          if (verdict === 'return_or_discard') $set.selectedForDigitization = false;
          if (isFinal && !wasFinal) {
            $set['decision.decidedBy'] = new Types.ObjectId(ctx.userId);
            $set['decision.decidedAt'] = now;
          }
          if (!isFinal) {
            $set['decision.decidedBy'] = null;
            $set['decision.decidedAt'] = null;
          }
        }
        ops.push({ updateOne: { filter: { _id: it._id }, update: { $set } } });
      }
      if (unnamed > 0) {
        throw new HttpError(
          400,
          `Give ${unnamed === 1 ? 'the item' : `all ${unnamed} items`} a name before answering the decision questions.`,
        );
      }
      for (let i = 0; i < ops.length; i += 1000) {
        await LotItem.bulkWrite(ops.slice(i, i + 1000), { session });
      }
      return null;
    },
  });

  const lot = await ArchiveLot.findById(lotId).lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  let summary = await summarise(lot._id);
  let finalized: ItemsBulkResponse['finalized'] = null;
  const blocked = blockedBy(lot, summary);
  if (touchesDecision && decisionOpen(lot) && summary.total > 0 && summary.decided === summary.total && blocked.length === 0) {
    // Every return/discard item needs its reason before the lot can be decided.
    const missingReason = await LotItem.countDocuments({
      lot: lot._id,
      'decision.verdict': 'return_or_discard',
      $or: [{ notDigitizedReason: null }, { notDigitizedReason: '' }],
    });
    if (missingReason > 0) {
      return {
        updated: ids.length,
        summary,
        finalized: null,
        blockedBy: [`Give a reason for ${missingReason} return/discard ${missingReason === 1 ? 'item' : 'items'}.`],
      };
    }
    finalized = await finalizeItemDecisions(lotId, ctx);
    summary = await summarise(lot._id);
  }
  return { updated: ids.length, summary, finalized, blockedBy: blocked };
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
      const dec = (d.decision ?? {}) as { decidedAt?: Date | null };
      return {
        id: String(d._id),
        code: d.code,
        name: d.name ?? null,
        lotId: String(d.lot),
        lotReference: d.lotReference ?? '',
        reason: d.notDigitizedReason ?? null,
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

/** Mark item returns/discards done — one audited write per lot touched. */
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
    .select('lot')
    .lean();
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
  }
  return { updated };
}
