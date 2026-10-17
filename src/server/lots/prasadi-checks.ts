import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { PRASADI_FORMAT } from '@/lib/item-columns';
import { CHECK_RESULTS, daysOverdue, nextCheckDate, weeksText } from '@/lib/recheck';
import { LotItem } from '@/models/LotItem';
import { withAudit, auditActor } from '@/server/audit';
import type { ItemLean } from '@/server/lots/item-grid';
import type { PrasadiCheckDoneBody, PrasadiCheckList, PrasadiCheckQuery } from '@/types/items';

/**
 * Prasadi quality checks. An item with "Re-check in N weeks" gets a due date; once it passes the
 * item shows on the Alerts page and in this queue until someone looks at it and records the
 * result. Marking checked stamps who / when, writes the result to the item's Condition and —
 * unless the next-weeks box is cleared — plans the following check.
 */

const endOfToday = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

export async function listPrasadiChecks(query: PrasadiCheckQuery, now = new Date()): Promise<PrasadiCheckList> {
  await connectToDatabase();
  const filter = { format: PRASADI_FORMAT, nextCheckDue: { $ne: null, $lte: endOfToday(now) } };
  const [docs, total] = await Promise.all([
    LotItem.find(filter)
      .sort({ nextCheckDue: 1, lot: 1, sortOrder: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    LotItem.countDocuments(filter),
  ]);
  return {
    rows: (docs as ItemLean[]).map((d) => ({
      id: String(d._id),
      code: d.code,
      itemName: d.name ?? null,
      blessedBy: ((d.attrs ?? {}) as Record<string, unknown>).blessedBy ? String((d.attrs as Record<string, unknown>).blessedBy) : null,
      condition: d.itemCondition ?? null,
      lotId: String(d.lot),
      lotReference: d.lotReference ?? '',
      recheckWeeks: d.recheckWeeks ?? null,
      dueAt: new Date(d.nextCheckDue!).toISOString().slice(0, 10),
      daysOverdue: Math.max(0, daysOverdue(new Date(d.nextCheckDue!), now)),
      lastCheckedAt: d.lastCheckedAt ? new Date(d.lastCheckedAt).toISOString().slice(0, 10) : null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Records a check on Prasadi items — one audited write per lot touched. */
export async function markPrasadiChecked(
  body: PrasadiCheckDoneBody,
  ctx: MutationContext,
  now = new Date(),
): Promise<{ updated: number }> {
  await connectToDatabase();
  const ids = body.itemIds.map((id) => new Types.ObjectId(id));
  const items = (await LotItem.find({ _id: { $in: ids }, format: PRASADI_FORMAT })
    .select('lot code')
    .lean()) as ItemLean[];
  if (items.length !== ids.length) throw new HttpError(404, 'Some of these are not Prasadi items.');

  const label = CHECK_RESULTS.find((r) => r.value === body.result)!.label;
  const byLot = new Map<string, Types.ObjectId[]>();
  for (const it of items) byLot.set(String(it.lot), [...(byLot.get(String(it.lot)) ?? []), it._id]);

  let updated = 0;
  for (const [lot, itemIds] of byLot) {
    await withAudit({
      lotId: lot,
      actor: auditActor(ctx),
      kind: 'prasadi_checked',
      title: `${itemIds.length} Prasadi ${itemIds.length === 1 ? 'item' : 'items'} checked — ${label}`,
      detail: [
        body.note ? `Note: ${body.note}` : null,
        body.nextWeeks ? `Next check in ${weeksText(body.nextWeeks)}.` : 'No further check planned.',
      ]
        .filter(Boolean)
        .join(' '),
      mutate: async (_lot, session) => {
        const res = await LotItem.updateMany(
          { _id: { $in: itemIds } },
          {
            $set: {
              itemCondition: label,
              lastCheckedAt: now,
              lastCheckedByName: ctx.userName,
              recheckWeeks: body.nextWeeks ?? null,
              nextCheckDue: body.nextWeeks ? nextCheckDate(now, body.nextWeeks) : null,
            },
          },
          { session },
        );
        updated += res.modifiedCount;
        return null;
      },
    });
  }
  return { updated };
}
