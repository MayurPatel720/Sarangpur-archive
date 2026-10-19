import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { parseDateRange } from '@/lib/date-range';
import { PRASADI_FORMAT } from '@/lib/item-columns';
import { REMOVAL_COLUMNS } from '@/lib/item-status';
import { LotItem } from '@/models/LotItem';
import { withAudit, auditActor } from '@/server/audit';
import { gridLocked } from '@/server/lots/item-grid';
import type { ItemStatusBody, ItemStatusResponse, Removal } from '@/types/items';

/**
 * Prasadi status. An item is taken out of the archive (Active → Inactive) with its removal details,
 * the details of an Inactive item can be corrected, and it can be made Active again. Inactive items
 * are read-only everywhere else (see applyItemEdits). Every change is one audited write.
 * Details Missing is never stored — see src/lib/item-status.ts.
 */

const single = (label: string, text: string | undefined): string | null => {
  if (!text) return null;
  const r = parseDateRange(text);
  if (!r.ok) throw new HttpError(400, `${label}: use dd/mm/yyyy.`);
  if (r.from !== r.to) throw new HttpError(400, `${label}: give one date, not a range.`);
  return text.trim();
};

/** The removal form → the item's attrs (only given values; blank ones are unset). */
function removalAttrs(removal: Removal): { $set: Record<string, unknown>; $unset: Record<string, ''> } {
  const dates = { removedOn: single('Date removed from archive', removal.removedOn), receivedAtNewOn: single('Date received at new location', removal.receivedAtNewOn) };
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const c of REMOVAL_COLUMNS) {
    const raw = c.id in dates ? dates[c.id as keyof typeof dates] : ((removal as Record<string, string | undefined>)[c.id] ?? '').trim();
    if (raw) $set[`attrs.${c.id}`] = raw;
    else $unset[`attrs.${c.id}`] = '';
  }
  return { $set, $unset };
}

export async function changeItemStatus(lotId: string, body: ItemStatusBody, ctx: MutationContext): Promise<ItemStatusResponse> {
  let out: ItemStatusResponse = { code: '', status: 'active' };
  await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'item_status_changed',
    title: body.action === 'reactivate' ? 'Item made active again' : body.action === 'remove' ? 'Item removed from the archive' : 'Removal details corrected',
    mutate: async (lot, session) => {
      if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      const it = await LotItem.findOne({ _id: body.itemId, lot: lot._id }).session(session);
      if (!it) throw new HttpError(404, 'Item not found on this lot.');
      if (it.format !== PRASADI_FORMAT) throw new HttpError(400, 'Only Prasadi items have a status.');
      const inactive = (it.attrs as Record<string, unknown> | undefined)?.status === 'inactive';

      if (body.action === 'reactivate') {
        if (!inactive) throw new HttpError(400, `${it.code} is already active.`);
        await LotItem.updateOne({ _id: it._id }, { $set: { 'attrs.status': 'active' } }, { session });
        out = { code: it.code, status: 'active' };
        return null;
      }

      if (body.action === 'remove' && inactive) throw new HttpError(400, `${it.code} has already been removed from the archive.`);
      if (body.action === 'edit_removal' && !inactive) throw new HttpError(400, `${it.code} is not removed — remove it first.`);
      const { $set, $unset } = removalAttrs(body.removal);
      if (body.action === 'remove') {
        $set['attrs.status'] = 'inactive';
        // A removed item is no longer looked at again: its check reminder stops.
        $set.recheckWeeks = null;
        $set.nextCheckDue = null;
      }
      await LotItem.updateOne({ _id: it._id }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { session });
      out = { code: it.code, status: 'inactive' };
      return null;
    },
  });
  return out;
}
