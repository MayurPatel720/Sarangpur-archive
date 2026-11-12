import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { LotItem } from '@/models/LotItem';
import { allocateItemCodes } from '@/server/codes';
import { parseItemCodeParts } from '@/lib/item-code';
import { autoDecisionFields, bornDigitalFields } from '@/lib/item-decision';
import { namingPrefix } from '@/server/lots/mutations';
import { withAudit, auditActor } from '@/server/audit';
import { assertActiveReferenceValue } from '@/server/reference';
import type { ItemCreateInput, ItemCreateResponse } from '@/types/project';

/**
 * Manual item entry — volunteers adding items to a lot beyond what intake auto-generated from the
 * received quantity. One call adds `quantity` items to one sheet (media line) and one group.
 *
 * Group / position continue the intake convention (36 per group); the code itself comes from the item
 * scheme (`MDV-AHM-0021-R-000`): leaving the group out appends to the last group, rolling to a new one
 * when it is full; an explicit `groupNo` starts / continues that group and rolls the rest into the next
 * new group once it holds 36. Codes stay unique via the collection's unique index; a lost append race
 * surfaces as 409, not 500.
 *
 * Counters: intake `quantity`/`quantityToDigitize` record what was RECEIVED and are left untouched —
 * only the live `digitization.expectedFileCount` moves (when the new items are selected), so the
 * digitize queue stays truthful.
 */
const ITEMS_PER_GROUP = 36;

export async function createItem(
  lotId: string,
  body: ItemCreateInput,
  ctx: MutationContext,
): Promise<ItemCreateResponse> {
  const selected = body.selectedForDigitization ?? true;
  const quantity = body.quantity ?? 1;
  const lineIndex = body.lineIndex ?? 0;
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
    title: quantity === 1 ? 'Item added' : `${quantity} items added`,
    detail: body.groupNo ? `Group ${body.groupNo}` : 'Appended to last group',
    mutate: async (lot, session) => {
      const line = lot.mediaLines?.[lineIndex];
      if (lineIndex > 0 && !line) throw new HttpError(400, 'That sheet does not exist on this lot.');

      const groups: { _id: number; maxItemNo: number; count: number }[] =
        await LotItem.aggregate([
          { $match: { lot: lot._id } },
          { $group: { _id: '$groupNo', maxItemNo: { $max: '$itemNo' }, count: { $sum: 1 } } },
        ]).session(session);
      let highestGroup = groups.reduce((m, g) => Math.max(m, g._id), 0);

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
      highestGroup = Math.max(highestGroup, groupNo);

      // Continue the pair already used by this sheet (the user may have changed it from
      // the default); an empty sheet falls back to sub-type prefix + origin.
      const sibling = (await LotItem.findOne({ lot: lot._id, lineIndex })
        .sort({ sortOrder: -1 })
        .select('code sortOrder')
        .session(session)
        .lean()) as { code: string; sortOrder?: number } | null;
      // A row cleared by Discard → "Yes and clear code" is now called discard-N: continue the pair from a normal row.
      const codedSibling =
        sibling && /^discard-\d+$/.test(sibling.code)
          ? ((await LotItem.findOne({ lot: lot._id, lineIndex, clearedCode: null })
              .sort({ sortOrder: -1 })
              .select('code')
              .session(session)
              .lean()) as { code: string } | null)
          : sibling;
      const parts = codedSibling ? parseItemCodeParts(codedSibling.code) : null;
      const codes = await allocateItemCodes(
        parts?.abbr1 ?? (await namingPrefix(line?.format ?? lot.format, line?.mediaSubtype ?? lot.mediaSubtype)),
        parts?.abbr2 ?? lot.originSource ?? 'OTH',
        quantity,
        session,
      );
      if (codes.length !== quantity) throw new HttpError(500, 'Could not allocate the item codes.');
      const firstSort = (sibling?.sortOrder ?? -1) + 1;
      const format = line?.format ?? lot.mediaLines?.[0]?.format ?? lot.format;
      const dataType = line?.dataType ?? lot.mediaLines?.[0]?.dataType ?? lot.dataType;

      // Number the items one after another; a full group rolls the rest into the next new group.
      const docs = codes.map((code, i) => {
        if (itemNo > ITEMS_PER_GROUP) {
          highestGroup += 1;
          groupNo = highestGroup;
          itemNo = 1;
        }
        const doc = {
          lot: lot._id,
          code,
          groupNo,
          itemNo,
          sortOrder: firstSort + i,
          format,
          // The chosen sheet (media line): its own breakdown stays intake-defined, totals stay truthful.
          lineIndex,
          selectedForDigitization: selected,
          notDigitizedReason: selected ? null : (body.notDigitizedReason ?? null),
          fileName: body.fileName?.trim() || null,
          ...autoDecisionFields(format),
          ...bornDigitalFields(format, dataType),
        };
        itemNo += 1;
        return doc;
      });

      let created: { _id: unknown }[];
      try {
        created = await LotItem.create(docs, { session, ordered: true });
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

      if (selected && !autoDecisionFields(format)) {
        lot.set('digitization.expectedFileCount', (lot.digitization?.expectedFileCount ?? 0) + quantity);
      }
      const first = docs[0]!;
      return {
        id: String(created[0]!._id),
        code: first.code,
        groupNo: first.groupNo,
        itemNo: first.itemNo,
        created: quantity,
        lastCode: docs[docs.length - 1]!.code,
      };
    },
  });
}
