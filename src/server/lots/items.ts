import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { LotItem } from '@/models/LotItem';
import { allocateItemCodes } from '@/server/codes';
import { parseItemCodeParts } from '@/lib/item-code';
import { namingPrefix } from '@/server/lots/mutations';
import { withAudit, auditActor } from '@/server/audit';
import { assertActiveReferenceValue } from '@/server/reference';
import type { ItemCreateInput, ItemCreateResponse } from '@/types/project';

/**
 * Manual item entry — volunteers adding individual items to a lot beyond what
 * intake auto-generated from the received quantity.
 *
 * Group / position continue the intake convention (36 per group); the code itself comes from the item scheme (`MDV-AHM-0021-R-000`):
 * appending targets the last group, rolling to a new group when it is full,
 * or an explicit `groupNo` starts/continues that group. Codes stay unique via
 * the collection's unique index; a lost append race surfaces as 409, not 500.
 *
 * Counters: intake `quantity`/`quantityToDigitize` record what was RECEIVED
 * and are left untouched — only the live `digitization.expectedFileCount`
 * moves (when the new item is selected), so the digitize queue stays truthful.
 */
const ITEMS_PER_GROUP = 36;

export async function createItem(
  lotId: string,
  body: ItemCreateInput,
  ctx: MutationContext,
): Promise<ItemCreateResponse> {
  const selected = body.selectedForDigitization ?? true;
  if (!selected && !body.notDigitizedReason) {
    throw new HttpError(400, 'Give a reason when the item is not selected for digitization.');
  }
  if (body.notDigitizedReason) {
    await assertActiveReferenceValue('notDigitizedReason', body.notDigitizedReason);
  }

  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'item_created',
    title: 'Item added',
    detail: body.groupNo ? `Group ${body.groupNo}` : 'Appended to last group',
    mutate: async (lot, session) => {

      const groups: { _id: number; maxItemNo: number; count: number }[] =
        await LotItem.aggregate([
          { $match: { lot: lot._id } },
          { $group: { _id: '$groupNo', maxItemNo: { $max: '$itemNo' }, count: { $sum: 1 } } },
        ]).session(session);

      let groupNo: number;
      let itemNo: number;
      if (body.groupNo !== undefined) {
        groupNo = body.groupNo;
        const existing = groups.find((g) => g._id === groupNo);
        itemNo = (existing?.maxItemNo ?? 0) + 1;
      } else {
        const last = groups.reduce((a, b) => (b._id > a._id ? b : a), { _id: 0, maxItemNo: 0, count: 0 });
        if (last._id === 0 || last.maxItemNo >= ITEMS_PER_GROUP) {
          groupNo = last._id + 1;
          itemNo = 1;
        } else {
          groupNo = last._id;
          itemNo = last.maxItemNo + 1;
        }
      }

      // Continue the pair already used by this sheet (the user may have changed it from
      // the default); an empty sheet falls back to sub-type prefix + origin.
      const sibling = (await LotItem.findOne({ lot: lot._id, lineIndex: 0 })
        .sort({ sortOrder: -1 })
        .select('code sortOrder')
        .session(session)
        .lean()) as { code: string; sortOrder?: number } | null;
      const parts = sibling ? parseItemCodeParts(sibling.code) : null;
      const [code] = await allocateItemCodes(
        parts?.abbr1 ?? (await namingPrefix(lot.format, lot.mediaSubtype)),
        parts?.abbr2 ?? lot.originSource ?? 'OTH',
        1,
        session,
      );
      if (!code) throw new HttpError(500, 'Could not allocate an item code.');
      const sortOrder = (sibling?.sortOrder ?? -1) + 1;
      let itemId = '';
      try {
        const [item] = await LotItem.create(
          [
            {
              lot: lot._id,
              code,
              groupNo,
              itemNo,
              sortOrder,
              format: lot.mediaLines?.[0]?.format ?? lot.format,
              // Manual entries attach to the primary media line (index 0):
              // per-line breakdowns stay intake-defined, totals stay truthful.
              lineIndex: 0,
              selectedForDigitization: selected,
              notDigitizedReason: selected ? null : (body.notDigitizedReason ?? null),
              fileName: body.fileName?.trim() || null,
              ...((lot.mediaLines?.[0]?.dataType ?? lot.dataType) === 'both' ? { decision: { digital: true } } : {}),
            },
          ],
          { session },
        );
        itemId = String(item!._id);
      } catch (error) {
        // Lost an append race: another volunteer took this slot first.
        if (error instanceof Error && (error as { code?: number }).code === 11000) {
          throw new HttpError(
            409,
            'Another volunteer just added an item here. Reload and try again.',
          );
        }
        throw error;
      }

      if (selected) {
        lot.set('digitization.expectedFileCount', (lot.digitization?.expectedFileCount ?? 0) + 1);
      }
      return { id: itemId, code, groupNo, itemNo };
    },
  });
}
