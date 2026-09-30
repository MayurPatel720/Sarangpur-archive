import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { User } from '@/models/User';
import {
  buildLotFilter,
  buildTokenClauses,
  escapeRegex,
  findReceiverIdsForQuery,
  lotSideMatches,
  mergeTextWithIdClauses,
  tokenizeQuery,
} from '@/server/lots/queries';
import type { SearchQuery, SearchResponse } from '@/types/search';

const ITEM_SCAN_LIMIT = 500;
const MATCHED_ITEMS_PER_LOT = 5;

type MatchedItem = { id: string; code: string; fileName: string | null };
type SearchRow = SearchResponse['rows'][number];

function prettify(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function returnSeverity(lot: {
  return?: { status?: string; dueAt?: Date | null } | null;
}): 'neutral' | 'info' | 'good' | 'warning' | 'critical' {
  const status = lot.return?.status ?? 'not_requested';
  if (status === 'returned') return 'good';
  if ((status === 'pending' || status === 'in_progress') && lot.return?.dueAt) {
    if (new Date(lot.return.dueAt).getTime() < Date.now()) return 'warning';
    return 'info';
  }
  return 'neutral';
}

function mapRow(
  d: {
    _id: unknown;
    lotReference: string;
    namingCode?: string | null;
    dateReceived: Date;
    owner: { name: string };
    pointsOfContact?: { name: string }[] | null;
    format: SearchRow['format'];
    mediaSubtype: string;
    quantity: number;
    dataType: SearchRow['dataType'];
    decision?: { status?: SearchRow['decision'] } | null;
    stage: SearchRow['stage'];
    receiver: unknown;
    return?: { status?: string; dueAt?: Date | null } | null;
  },
  names: Map<string, string>,
): Omit<SearchRow, 'matchedVia' | 'matchedItems'> {
  return {
    id: String(d._id),
    lotReference: d.lotReference,
    namingCode: d.namingCode ?? null,
    dateReceived: d.dateReceived.toISOString(),
    ownerName: d.owner.name,
    pointOfContactName: d.pointsOfContact?.[0]?.name ?? null,
    format: d.format,
    mediaSubtype: d.mediaSubtype,
    quantity: d.quantity,
    dataType: d.dataType,
    decision: d.decision?.status ?? 'pending',
    stage: d.stage,
    receiverName: names.get(String(d.receiver)) ?? 'Unknown',
    returnLabel: prettify(d.return?.status ?? 'not_requested'),
    returnSeverity: returnSeverity(d),
  };
}

/** Prefer anchored uppercase prefix on item codes so the unique index can help. */
function itemTextOr(token: string): Record<string, unknown>[] {
  const upper = token.toUpperCase();
  const clauses: Record<string, unknown>[] = [];
  if (/^[A-Z0-9][A-Z0-9-]*$/.test(upper) && token.length >= 2) {
    clauses.push({ code: { $regex: `^${escapeRegex(upper)}` } });
  }
  const rx = new RegExp(escapeRegex(token), 'i');
  clauses.push({ code: rx }, { fileName: rx });
  return clauses;
}

/**
 * Global search: text over lots + item codes/filenames, then one paginated
 * lot query filtered by chips. No $lookup — items resolve first, lot ids
 * merge into the lot `$or`.
 */
export async function searchLots(query: SearchQuery): Promise<SearchResponse> {
  await connectToDatabase();

  const hasText = Boolean(query.q);
  const hasChip = Boolean(query.format || query.dataType || query.stage || query.decision);
  if (!hasText && !hasChip) {
    return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  const matchedByLot = new Map<string, MatchedItem[]>();

  if (query.q) {
    // Item codes carry no spaces: a multi-word query matches when ANY token
    // looks like the code, so "ram NEG-MUM-014" still finds the item.
    const itemOr = tokenizeQuery(query.q).flatMap((tok) => itemTextOr(tok));
    const items =
      itemOr.length > 0
        ? await LotItem.find({ $or: itemOr })
            .limit(ITEM_SCAN_LIMIT)
            .select('code lot fileName')
            .lean()
        : [];

    for (const it of items) {
      const lotId = String(it.lot);
      const list = matchedByLot.get(lotId) ?? [];
      if (list.length >= MATCHED_ITEMS_PER_LOT) continue;
      list.push({
        id: String(it._id),
        code: it.code,
        fileName: it.fileName ?? null,
      });
      matchedByLot.set(lotId, list);
    }
  }

  // Chips first; text (lot fields AND-tokens, item-hit ids, receiver ids)
  // merges on top. No $lookup — items resolve first, lot ids merge in.
  const { q: textQ, ...chipQuery } = query;
  const filter = buildLotFilter(chipQuery);
  if (textQ) {
    const tokenClauses = buildTokenClauses(textQ);
    const idClauses: Record<string, unknown>[] = [];
    const itemLotIds = [...matchedByLot.keys()];
    if (itemLotIds.length > 0) {
      idClauses.push({ _id: { $in: itemLotIds.map((id) => new Types.ObjectId(id)) } });
    }
    const receiverIds = await findReceiverIdsForQuery(textQ);
    if (receiverIds.length > 0) {
      idClauses.push({ receiver: { $in: receiverIds } });
    }
    const textFilter = mergeTextWithIdClauses(tokenClauses, idClauses);
    if (textFilter) Object.assign(filter, textFilter);
  }

  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    ArchiveLot.find(filter)
      .sort({ dateReceived: -1 })
      .skip(skip)
      .limit(query.pageSize)
      .lean(),
    ArchiveLot.countDocuments(filter),
  ]);

  const receiverIds = [...new Set(docs.map((d) => String(d.receiver)))];
  const users = await User.find({ _id: { $in: receiverIds } })
    .select('name')
    .lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));

  const rows: SearchRow[] = docs.map((d) => {
    const id = String(d._id);
    const matchedItems = matchedByLot.get(id) ?? [];
    const lotSide = query.q ? lotSideMatches(d, query.q) : true;

    const matchedVia: 'lot' | 'item' | 'both' =
      lotSide && matchedItems.length > 0
        ? 'both'
        : matchedItems.length > 0
          ? 'item'
          : 'lot';

    return {
      ...mapRow(d, names),
      matchedVia,
      matchedItems,
    };
  });

  return { rows, total, page: query.page, pageSize: query.pageSize };
}
