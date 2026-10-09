import { Types } from 'mongoose';
import { FORMATS, type Format } from '@/lib/domain';
import { connectToDatabase } from '@/lib/mongo';
import type { MutationContext } from '@/lib/api';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { can } from '@/server/permissions';
import { activeValuesWithFlag } from '@/server/reference/runtime';
import type {
  ReturnCard,
  ReturnContact,
  ReturnedRow,
  ReturnsQuery,
  ReturnsResponse,
  ReturnsSummary,
} from '@/types/returns';

/**
 * The Returns screen's read side. Two kinds of return share one board:
 *  - WHOLE LOT: the lot's return status is open (pending / in progress);
 *  - ITEMS: single items decided "return" inside a lot that was otherwise archived.
 * One card per lot; the "Returned" history lists finished handovers with who received them.
 * Viewers only see the formats their role holds.
 */

const DAY = 86_400_000;
const DUE_SOON_DAYS = 7;
const CAP = 2000;

const oid = (id: unknown) => id as Types.ObjectId;
const iso = (d: unknown) => (d ? new Date(d as Date).toISOString() : null);
const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function allowedFormats(ctx: MutationContext): Format[] {
  return FORMATS.filter((f) => can(ctx.grants, `format:${f}`));
}

/** Whole days from `today` to `due` (negative = overdue), both calendar days. */
function daysBetween(todayIso: string, due: Date): number {
  const t = new Date(`${todayIso}T00:00:00.000Z`).getTime();
  const d = new Date(`${due.toISOString().slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round((d - t) / DAY);
}

interface LotLite {
  _id: Types.ObjectId;
  lotReference: string;
  namingCode?: string | null;
  format: string;
  quantity: number;
  owner?: { name?: string; phone?: string | null; email?: string | null; address?: string | null } | null;
  pointsOfContact?: { name: string; phone?: string | null; email?: string | null; address?: string | null }[];
  facilitator?: { name: string; phone?: string | null; email?: string | null; address?: string | null } | null;
  assigneeName?: string | null;
  stageEnteredAt?: Date;
  return?: {
    status?: string;
    format?: string;
    durationText?: string | null;
    dueAt?: Date | null;
    returnedAt?: Date | null;
    method?: string | null;
    trackingReference?: string | null;
    notes?: string | null;
    recipient?: { name?: string | null; email?: string | null; phone?: string | null; place?: string | null } | null;
  } | null;
}

const LOT_FIELDS =
  'lotReference namingCode format quantity owner pointsOfContact facilitator assigneeName stageEnteredAt return';

function contactsOf(lot: LotLite): ReturnContact[] {
  const out: ReturnContact[] = [];
  const push = (role: string, c: { name?: string; phone?: string | null; email?: string | null; address?: string | null } | null | undefined) => {
    if (c?.name) out.push({ role, name: c.name, phone: c.phone ?? null, email: c.email ?? null, address: c.address ?? null });
  };
  push('Owner', lot.owner);
  (lot.pointsOfContact ?? []).forEach((c, i) => push(i === 0 ? 'Point of contact' : `Point of contact ${i + 1}`, c));
  push('Facilitator', lot.facilitator);
  return out;
}

export async function listReturns(query: ReturnsQuery, ctx: MutationContext): Promise<ReturnsResponse> {
  await connectToDatabase();
  const today = query.today ?? new Date().toISOString().slice(0, 10);
  const formats = allowedFormats(ctx);
  const openStatuses = await activeValuesWithFlag('returnStatus', 'open');
  const open = openStatuses.length > 0 ? openStatuses : ['pending', 'in_progress'];

  /* ---------- to return: whole lots + lots with pending item returns ---------- */
  const [wholeLots, pendingItems] = await Promise.all([
    ArchiveLot.find({ 'return.status': { $in: open }, format: { $in: formats } }).select(LOT_FIELDS).limit(CAP).lean(),
    LotItem.find({ 'decision.disposition': 'return', dispositionStatus: 'pending' })
      .select('lot code name digitized decision')
      .limit(CAP)
      .lean(),
  ]);
  const itemsByLot = new Map<string, typeof pendingItems>();
  for (const it of pendingItems) itemsByLot.set(String(it.lot), [...(itemsByLot.get(String(it.lot)) ?? []), it]);
  const wholeIds = new Set(wholeLots.map((l) => String(l._id)));
  const extraIds = [...itemsByLot.keys()].filter((id) => !wholeIds.has(id)).map((id) => new Types.ObjectId(id));
  const extraLots = extraIds.length
    ? await ArchiveLot.find({ _id: { $in: extraIds }, format: { $in: formats } }).select(LOT_FIELDS).lean()
    : [];

  const needsDigital = (it: { digitized?: boolean; decision?: { digital?: boolean | null; redigital?: boolean | null } | null }) =>
    (it.decision?.digital === true || it.decision?.redigital === true) && !it.digitized;

  const cards: ReturnCard[] = [...wholeLots, ...extraLots].map((l) => {
    const lot = l as unknown as LotLite;
    const whole = wholeIds.has(String(lot._id));
    const its = itemsByLot.get(String(lot._id)) ?? [];
    const due = lot.return?.dueAt ?? null;
    const days = due ? daysBetween(today, new Date(due)) : null;
    return {
      key: String(lot._id),
      lotId: String(lot._id),
      lotReference: lot.lotReference,
      namingCode: lot.namingCode ?? null,
      ownerName: lot.owner?.name ?? '',
      format: lot.format,
      wholeLot: whole,
      itemCount: whole ? lot.quantity : its.length,
      items: whole
        ? []
        : its.slice(0, 200).map((it) => ({
            id: String(it._id),
            code: it.code,
            name: (it as { name?: string | null }).name ?? null,
            waiting: needsDigital(it as never),
          })),
      waitingCount: whole ? 0 : its.filter((it) => needsDigital(it as never)).length,
      dueAt: iso(due),
      overdue: days !== null && days < 0,
      daysToDue: days,
      requestedFormat: lot.return?.format && lot.return.format !== 'none' ? lot.return.format : null,
      durationText: lot.return?.durationText ?? null,
      assigneeName: lot.assigneeName ?? null,
      contacts: contactsOf(lot),
    };
  });

  /* ---------------------------------- returned history ---------------------------------- */
  const since = new Date(Date.now() - 30 * DAY);
  const [returnedLots, doneBatches] = await Promise.all([
    ArchiveLot.find({ 'return.status': 'returned', format: { $in: formats } })
      .select(LOT_FIELDS)
      .sort({ 'return.returnedAt': -1 })
      .limit(500)
      .lean(),
    LotItem.aggregate<{
      _id: { lot: Types.ObjectId; batch: string };
      n: number;
      codes: string[];
      doneAt: Date;
      by: string | null;
      info: { recipientName?: string; recipientEmail?: string; recipientPhone?: string; recipientPlace?: string; method?: string; trackingReference?: string; notes?: string };
    }>([
      { $match: { 'decision.disposition': 'return', dispositionStatus: 'done' } },
      { $sort: { dispositionDoneAt: -1 } },
      {
        $group: {
          _id: {
            lot: '$lot',
            batch: { $ifNull: ['$returnInfo.batchId', { $dateToString: { format: '%Y-%m-%d', date: '$dispositionDoneAt' } }] },
          },
          n: { $sum: 1 },
          codes: { $push: '$code' },
          doneAt: { $max: '$dispositionDoneAt' },
          by: { $first: '$dispositionDoneByName' },
          info: { $first: '$returnInfo' },
        },
      },
      { $sort: { doneAt: -1 } },
      { $limit: 500 },
    ]),
  ]);
  const batchLotIds = [...new Set(doneBatches.map((b) => String(b._id.lot)))].map((id) => new Types.ObjectId(id));
  const batchLots = batchLotIds.length
    ? await ArchiveLot.find({ _id: { $in: batchLotIds }, format: { $in: formats } }).select('lotReference owner format').lean()
    : [];
  const batchLotById = new Map(batchLots.map((l) => [String(l._id), l]));

  const recipientOf = (r: { name?: string | null; email?: string | null; phone?: string | null; place?: string | null } | null | undefined) =>
    r?.name ? { name: r.name, email: r.email ?? null, phone: r.phone ?? null, place: r.place ?? null } : null;

  const returned: ReturnedRow[] = [
    ...returnedLots.map((l): ReturnedRow => {
      const lot = l as unknown as LotLite;
      return {
        key: `lot-${lot._id}`,
        lotId: String(lot._id),
        lotReference: lot.lotReference,
        ownerName: lot.owner?.name ?? '',
        scope: 'lot',
        count: lot.quantity,
        itemCodes: [],
        recipient: recipientOf(lot.return?.recipient),
        method: lot.return?.method ?? null,
        trackingReference: lot.return?.trackingReference ?? null,
        notes: lot.return?.notes ?? null,
        returnedAt: iso(lot.return?.returnedAt),
        byName: null,
      };
    }),
    ...doneBatches.flatMap((b): ReturnedRow[] => {
      const lot = batchLotById.get(String(b._id.lot));
      if (!lot) return [];
      return [
        {
          key: `items-${b._id.lot}-${b._id.batch}`,
          lotId: String(b._id.lot),
          lotReference: lot.lotReference,
          ownerName: (lot as unknown as LotLite).owner?.name ?? '',
          scope: 'items',
          count: b.n,
          itemCodes: b.codes.slice(0, 6),
          recipient: recipientOf({
            name: b.info?.recipientName,
            email: b.info?.recipientEmail,
            phone: b.info?.recipientPhone,
            place: b.info?.recipientPlace,
          }),
          method: b.info?.method ?? null,
          trackingReference: b.info?.trackingReference ?? null,
          notes: b.info?.notes ?? null,
          returnedAt: iso(b.doneAt),
          byName: b.by ?? null,
        },
      ];
    }),
  ].sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));

  /* -------------------------------------- summary -------------------------------------- */
  const summary: ReturnsSummary = {
    lotsToReturn: cards.length,
    itemsToReturn: cards.reduce((s, c) => s + c.itemCount, 0),
    overdue: cards.filter((c) => c.overdue).length,
    dueSoon: cards.filter((c) => c.daysToDue !== null && c.daysToDue >= 0 && c.daysToDue <= DUE_SOON_DAYS).length,
    returnedLast30Days: returned.filter((r) => r.returnedAt && new Date(r.returnedAt) >= since).length,
  };

  /* ---------------------------------- search, sort, page ---------------------------------- */
  const q = query.q?.trim();
  const rx = q ? new RegExp(escapeRegex(q), 'i') : null;
  const skip = (query.page - 1) * query.pageSize;

  if (query.tab === 'done') {
    const rows = rx
      ? returned.filter((r) =>
          [r.lotReference, r.ownerName, r.recipient?.name, r.recipient?.place, r.recipient?.phone, r.recipient?.email, r.trackingReference, ...r.itemCodes].some(
            (v) => v && rx.test(v),
          ),
        )
      : returned;
    return {
      tab: 'done',
      cards: [],
      returned: rows.slice(skip, skip + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
      summary,
      can: { record: can(ctx.grants, 'return:manage') },
    };
  }

  const filtered = rx
    ? cards.filter((c) =>
        [c.lotReference, c.namingCode, c.ownerName, ...c.items.flatMap((i) => [i.code, i.name]), ...c.contacts.map((k) => k.name)].some(
          (v) => v && rx.test(v),
        ),
      )
    : cards;
  // Most urgent first: overdue (oldest due first), then due soonest, then undated.
  filtered.sort((a, b) => (a.daysToDue ?? 99_999) - (b.daysToDue ?? 99_999) || a.lotReference.localeCompare(b.lotReference));
  return {
    tab: 'todo',
    cards: filtered.slice(skip, skip + query.pageSize),
    returned: [],
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    summary,
    can: { record: can(ctx.grants, 'return:manage') },
  };
}
