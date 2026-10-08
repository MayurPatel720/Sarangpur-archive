import { Types, type AnyBulkWriteOperation, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { abbrError, buildItemCode, parseItemCodeParts } from '@/lib/item-code';
import { ALWAYS_VISIBLE, BUILTIN_COLUMNS } from '@/lib/item-columns';
import { ActivityLog } from '@/models/ActivityLog';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { withAudit, auditActor } from '@/server/audit';
import { maxItemNumber, usedItemNumbers } from '@/server/codes';
import { canWorkLot } from '@/server/lots/access';
import { gridLocked } from '@/server/lots/item-grid';
import { can } from '@/server/permissions';
import type {
  CodeInfoResponse,
  ColumnsBody,
  ColumnsResponse,
  ItemDuplicateBody,
  ItemDuplicateResponse,
  ItemNumberBody,
  ItemOrderBody,
  SheetCodeBody,
  SheetCodeResponse,
} from '@/types/items';

/**
 * Item codes, duplicates, row order and the lot's Excel setup (hidden / custom columns).
 * Item-code rules live in src/lib/item-code.ts; the running number of an abbreviation
 * pair is "highest in use + 1" (src/server/codes.ts), so freed or jumped-over numbers
 * stay available.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* --------------------------------------------------------------- code info */

export async function codeInfo(abbr1: string, abbr2: string): Promise<CodeInfoResponse> {
  const e1 = abbrError('First abbreviation', abbr1);
  const e2 = abbrError('Second abbreviation', abbr2);
  if (e1 || e2) throw new HttpError(400, (e1 ?? e2)!);
  const highest = await maxItemNumber(abbr1.trim(), abbr2.trim());
  return { highest, nextNo: highest + 1 };
}

/* ------------------------------------------------------ re-code one sheet */

type ItemRow = { _id: Types.ObjectId; code: string; taggedInMls?: boolean; digitized?: boolean; duplicateCode?: string | null };

/** Codes of `rows` that other items point at as their original (so they must not change). */
async function referencedBy(codes: string[], session?: ClientSession): Promise<string[]> {
  if (codes.length === 0) return [];
  const dups = await LotItem.find({ duplicateCode: { $in: codes } })
    .select('duplicateCode')
    .session(session ?? null)
    .lean();
  return [...new Set(dups.map((d) => String(d.duplicateCode)))];
}

/**
 * Sets one sheet's (media line's) item codes: both abbreviations and the first number; the
 * rest continue in row order. The user's own earlier numbers are released first, so
 * re-using the same pair with a different start works. Duplicate (D) rows keep their codes.
 */
export async function recodeSheet(lotId: string, body: SheetCodeBody, ctx: MutationContext): Promise<SheetCodeResponse> {
  const abbr1 = body.abbr1.trim();
  const abbr2 = body.abbr2.trim();
  const e1 = abbrError('First abbreviation', abbr1);
  const e2 = abbrError('Second abbreviation', abbr2);
  if (e1 || e2) throw new HttpError(400, (e1 ?? e2)!);

  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'item_code_changed',
    title: 'Item codes changed',
    mutate: async (lot, session) => {
      if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      const items = (await LotItem.find({ lot: lot._id, lineIndex: body.lineIndex })
        .sort({ sortOrder: 1, groupNo: 1, itemNo: 1 })
        .select('code taggedInMls digitized')
        .session(session)
        .lean()) as ItemRow[];
      const own = items.filter((i) => parseItemCodeParts(i.code)?.kind === 'R');
      if (own.length === 0) throw new HttpError(400, 'This sheet has no items to re-code.');
      const tagged = own.filter((i) => i.taggedInMls);
      if (tagged.length > 0) {
        throw new HttpError(409, `${tagged.length} item${tagged.length === 1 ? ' is' : 's are'} already tagged in MLS, so their codes can no longer change.`);
      }
      const referenced = await referencedBy(own.map((i) => i.code), session);
      if (referenced.length > 0) {
        throw new HttpError(409, `${referenced[0]} is the original of a duplicate, so its code can no longer change.`);
      }

      // Release this sheet's own numbers (placeholder codes are unique per item), then allocate fresh.
      await LotItem.bulkWrite(
        own.map((i) => ({ updateOne: { filter: { _id: i._id }, update: { $set: { code: `~${String(i._id)}` } } } })),
        { session },
      );
      const start = body.startNo ?? (await maxItemNumber(abbr1, abbr2, session)) + 1;
      const end = start + own.length - 1;
      const used = await usedItemNumbers(abbr1, abbr2, start, end, session);
      if (used.size > 0) {
        const first = [...used].sort((a, b) => a - b)[0]!;
        throw new HttpError(409, `${abbr1}-${abbr2}-${String(first).padStart(4, '0')} is already used by another item. Pick a different start number.`);
      }
      const codes = own.map((_, idx) => buildItemCode({ abbr1, abbr2, no: start + idx, kind: 'R', copy: 0 }));
      await LotItem.bulkWrite(
        own.map((i, idx) => ({ updateOne: { filter: { _id: i._id }, update: { $set: { code: codes[idx]! } } } })),
        { session },
      );
      return { updated: own.length, firstCode: codes[0]!, lastCode: codes[codes.length - 1]! };
    },
  });
}

/** Change ONE item's number to a free one (the abbreviations stay). */
export async function setItemNumber(lotId: string, body: ItemNumberBody, ctx: MutationContext): Promise<{ code: string }> {
  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'item_code_changed',
    title: 'Item code changed',
    mutate: async (lot, session) => {
      if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      const it = (await LotItem.findOne({ _id: body.itemId, lot: lot._id }).session(session).lean()) as
        | (ItemRow & { code: string })
        | null;
      if (!it) throw new HttpError(404, 'Item not found on this lot.');
      const parts = parseItemCodeParts(it.code);
      if (!parts) throw new HttpError(400, 'This item has no editable code.');
      if (parts.kind !== 'R') throw new HttpError(400, 'A duplicate takes its original’s number — change the original instead.');
      if (it.taggedInMls) throw new HttpError(409, 'This item is already tagged in MLS, so its code can no longer change.');
      if ((await referencedBy([it.code], session)).length > 0) {
        throw new HttpError(409, 'This item is the original of a duplicate, so its code can no longer change.');
      }
      if (parts.no !== body.no) {
        const used = await usedItemNumbers(parts.abbr1, parts.abbr2, body.no, body.no, session);
        if (used.has(body.no)) {
          throw new HttpError(409, `${parts.abbr1}-${parts.abbr2}-${String(body.no).padStart(4, '0')} is already used.`);
        }
      }
      const code = buildItemCode({ ...parts, no: body.no });
      await LotItem.updateOne({ _id: it._id }, { $set: { code } }, { session });
      return { code };
    },
  });
}

/* --------------------------------------------------------------- duplicates */

/** Next free D copy number for an original: 0 for the first duplicate, then 1, 2 … */
async function nextDuplicateCopy(abbr1: string, abbr2: string, no: number, session?: ClientSession): Promise<number> {
  const pattern = `^${escapeRe(abbr1)}-${escapeRe(abbr2)}-${String(no).padStart(4, '0')}-D-\\d{3,}$`;
  const rows = await LotItem.find({ code: { $regex: pattern } }).select('code').session(session ?? null).lean();
  const copies = rows.map((r) => parseItemCodeParts(r.code)?.copy ?? -1);
  return copies.length === 0 ? 0 : Math.max(...copies) + 1;
}

type SideItem = ItemRow & { lot: Types.ObjectId; code: string };

/**
 * Marks an item as a duplicate of an original. The ORIGINAL keeps its code (it may already
 * be stored and stickered); the duplicate takes the original's abbreviations and number
 * with kind D (`ALB-surat-0004-D-000`, next duplicate `-D-001` …) and records the
 * original in Duplicate code. The duplicate's old number is freed. Nothing is written to
 * the original's lot — its row finds the link on read. `confirm: false` only returns the plan.
 */
export async function markDuplicate(
  lotId: string,
  body: ItemDuplicateBody,
  ctx: MutationContext,
): Promise<ItemDuplicateResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const here = (await LotItem.findOne({ _id: body.itemId, lot: lotId }).lean()) as SideItem | null;
  if (!here) throw new HttpError(404, 'Item not found on this lot.');
  const there = (await LotItem.findOne({ code: body.otherCode }).lean()) as SideItem | null;
  if (!there) throw new HttpError(404, `No item has the code ${body.otherCode}.`);
  if (String(there._id) === String(here._id)) throw new HttpError(400, 'An item cannot be a duplicate of itself.');

  // Default: the item already in the archive (typed code) is the original; swap flips it.
  const main = body.swap ? here : there;
  const dup = body.swap ? there : here;
  const mainParts = parseItemCodeParts(main.code);
  const dupParts = parseItemCodeParts(dup.code);
  if (!mainParts || !dupParts) throw new HttpError(400, 'Both items need a valid item code.');
  if (mainParts.kind !== 'R') {
    throw new HttpError(400, `${main.code} is itself a duplicate — pick its original (…-R-000) as the main item.`);
  }
  if (dupParts.kind !== 'R') {
    throw new HttpError(400, `${dup.code} is already marked as a duplicate.`);
  }
  if (dup.taggedInMls) throw new HttpError(409, `${dup.code} is already tagged in MLS, so its code can no longer change.`);

  const lotDocs = await ArchiveLot.find({ _id: { $in: [main.lot, dup.lot] } })
    .select('lotReference stage assignee assigneeName syncProjectId namingCode format')
    .lean();
  const lotOf = (id: Types.ObjectId) => lotDocs.find((l) => String(l._id) === String(id));
  const mainLot = lotOf(main.lot);
  const dupLot = lotOf(dup.lot);
  if (!mainLot || !dupLot) throw new HttpError(404, 'Lot not found.');

  const copy = await nextDuplicateCopy(mainParts.abbr1, mainParts.abbr2, mainParts.no);
  const newCode = buildItemCode({ ...mainParts, kind: 'D', copy });

  // The duplicate's lot is the only one written, so only that lot's access rules matter.
  let blocked: string | null = null;
  if (!can(ctx.grants, 'lot:edit')) blocked = 'You do not have the right to edit lots.';
  else if (gridLocked(dupLot.stage)) blocked = `${dupLot.lotReference} is finished and locked.`;
  else if (!canWorkLot(dupLot, { id: ctx.userId, grants: ctx.grants })) {
    blocked = `${dupLot.lotReference} is assigned to ${dupLot.assigneeName ?? 'someone else'}; only they or an admin can re-code its items.`;
  } else if ((await referencedBy([dup.code])).length > 0) {
    blocked = `${dup.code} is the original of another duplicate, so its code can no longer change.`;
  }

  const plan: ItemDuplicateResponse = {
    applied: false,
    main: { itemId: String(main._id), code: main.code, lotId: String(main.lot), lotReference: mainLot.lotReference, here: String(main.lot) === lotId },
    duplicate: {
      itemId: String(dup._id),
      code: dup.code,
      lotId: String(dup.lot),
      lotReference: dupLot.lotReference,
      here: String(dup.lot) === lotId,
      newCode,
    },
    blocked,
  };
  if (!body.confirm) return plan;
  if (blocked) throw new HttpError(403, blocked);

  await withAudit({
    lotId: String(dup.lot),
    actor: auditActor(ctx),
    kind: 'item_duplicate_marked',
    title: `${dup.code} marked as a duplicate of ${main.code}`,
    detail: `New code ${newCode}. The number ${dup.code} is free again.`,
    mutate: async (_lot, session) => {
      const fresh = await LotItem.findOne({ _id: dup._id }).select('code').session(session).lean();
      if (!fresh || fresh.code !== dup.code) throw new HttpError(409, 'This item changed meanwhile. Reload and try again.');
      await LotItem.updateOne({ _id: dup._id }, { $set: { code: newCode, duplicateCode: main.code } }, { session });
      return null;
    },
  });
  // The original's lot is not edited; leave a trail entry there so its history shows the link.
  if (String(main.lot) !== String(dup.lot)) {
    await ActivityLog.create([
      {
        lot: main.lot,
        lotCode: mainLot.namingCode ?? mainLot.lotReference,
        format: mainLot.format ?? null,
        kind: 'item_duplicate_marked',
        title: `${main.code} has a duplicate: ${newCode}`,
        detail: `Found in ${dupLot.lotReference}.`,
        actor: new Types.ObjectId(ctx.userId),
        actorName: ctx.userName,
        at: new Date(),
        changes: [],
      },
    ]);
  }
  return { ...plan, applied: true };
}

/* -------------------------------------------------------------- row order */

/** Saves a drag in the grid: the sheet's rows, top to bottom. Codes never change. */
export async function reorderItems(lotId: string, body: ItemOrderBody, ctx: MutationContext): Promise<{ updated: number }> {
  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'items_reordered',
    title: 'Rows reordered',
    mutate: async (lot, session) => {
      if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      const items = await LotItem.find({ lot: lot._id, lineIndex: body.lineIndex }).select('sortOrder').session(session).lean();
      const ids = new Set(items.map((i) => String(i._id)));
      if (body.orderedIds.length !== ids.size || !body.orderedIds.every((id) => ids.has(id))) {
        throw new HttpError(409, 'The rows changed since you opened them. Reload and try again.');
      }
      // Re-deal this sheet's own sortOrder numbers, so other sheets keep their positions.
      // If they are not all different (never reordered), number them from the lowest one.
      const sorted = items.map((i) => i.sortOrder ?? 0).sort((a, b) => a - b);
      const slots = new Set(sorted).size === sorted.length ? sorted : sorted.map((_, i) => (sorted[0] ?? 0) + i);
      const ops: AnyBulkWriteOperation[] = body.orderedIds.map((id, idx) => ({
        updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { $set: { sortOrder: slots[idx]! } } },
      }));
      await LotItem.bulkWrite(ops, { session });
      return { updated: body.orderedIds.length };
    },
  });
}

/* ------------------------------------------------- hidden / custom columns */

const MAX_CUSTOM = 30;

/** Hide / unhide columns, add or remove a custom column — shared by everyone on this lot. */
export async function updateColumns(lotId: string, body: ColumnsBody, ctx: MutationContext): Promise<ColumnsResponse> {
  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'columns_changed',
    title: 'Excel columns changed',
    mutate: async (lot, session) => {
      if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
      const custom = [...(lot.customColumns ?? [])].map((c) => ({ key: c.key, label: c.label, type: c.type, dept: c.dept }));
      let hidden = [...(lot.hiddenColumns ?? [])];

      if (body.add) {
        if (custom.length >= MAX_CUSTOM) throw new HttpError(400, `A lot's Excel can have at most ${MAX_CUSTOM} added columns.`);
        const label = body.add.label.trim();
        const clash = [...BUILTIN_COLUMNS, ...custom].some((c) => c.dept === body.add!.dept && c.label.toLowerCase() === label.toLowerCase());
        if (clash) throw new HttpError(409, `${label} already exists in that department.`);
        const key = `c_${new Types.ObjectId().toHexString().slice(-8)}`;
        custom.push({ key, label, type: body.add.type, dept: body.add.dept });
      }
      if (body.removeKey) {
        const gone = custom.find((c) => c.key === body.removeKey);
        if (!gone) throw new HttpError(404, 'That column does not exist.');
        custom.splice(custom.indexOf(gone), 1);
        hidden = hidden.filter((h) => h !== gone.key);
        await LotItem.updateMany({ lot: lot._id }, { $unset: { [`custom.${gone.key}`]: '' } }, { session });
      }
      if (body.hidden) {
        const known = new Set([...BUILTIN_COLUMNS.map((c) => c.id), ...custom.map((c) => c.key)]);
        hidden = [...new Set(body.hidden)].filter((id) => known.has(id) && !ALWAYS_VISIBLE.has(id));
      }
      lot.set('customColumns', custom);
      lot.set('hiddenColumns', hidden);
      return { hiddenColumns: hidden, customColumns: custom };
    },
  });
}
