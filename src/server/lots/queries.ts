import { Types } from 'mongoose';
import { TERMINAL_STAGES } from '@/lib/domain';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { ActivityLog } from '@/models/ActivityLog';
import { Attachment } from '@/models/Attachment';
import { User } from '@/models/User';
import { LotPickup } from '@/models/LotPickup';
import { Project } from '@/models/Project';
import { intakeMissing } from '@/lib/intake-gate';
import { resolveReferenceLabel, getReferenceList } from '@/server/reference';
import { subtypeListKeyForFormat, subtypeListKeySync } from '@/server/reference/runtime';
import type { LotDetailResponse, LotListQuery, LotListResponse } from '@/types/lot';
import type { ItemsQuery, ItemsResponse, ActivityQuery, ActivityResponse } from '@/types/ops';
import type { TriageItemsResponse } from '@/types/triage';

/**
 * Subtype list key for a format, from the admin `format` list meta.
 * Sync fallback uses the domain mapping; async form is preferred on write paths.
 */
export function mediaSubtypeListKey(format: string): string | null {
  return subtypeListKeySync(format);
}

/** Async variant that reads format meta from the database (with cache). */
export async function mediaSubtypeListKeyAsync(format: string): Promise<string | null> {
  return subtypeListKeyForFormat(format);
}

function prettify(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function returnSeverity(lot: ArchiveLotDoc): 'neutral' | 'info' | 'good' | 'warning' | 'critical' {  const status = lot.return?.status ?? 'not_requested';
  if (status === 'returned') return 'good';
  if ((status === 'pending' || status === 'in_progress') && lot.return?.dueAt) {
    if (new Date(lot.return.dueAt).getTime() < Date.now()) return 'warning';
    return 'info';
  }
  return 'neutral';
}

/**
 * Audit kinds that move a lot *into* each stage, latest-wins. Terminal stages
 * list every kind that can cause the entry (direct-from-decision or later flow).
 */
const STAGE_ENTRY_KINDS: Record<string, string[]> = {
  intake: ['intake_created'],
  decision: ['submitted_for_decision'],
  metadata: ['decision_recorded'],
  scanning: ['scan_started'],
  mls_tag: ['scan_completed'],
  storage: ['mls_tagged'],
  returned: ['return_completed', 'return_recorded', 'decision_recorded'],
  discarded: ['discard_confirmed', 'decision_recorded'],
};

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  dateReceived: { dateReceived: 1 },
  '-dateReceived': { dateReceived: -1 },
  stage: { stage: 1 },
  '-stage': { stage: -1 },
  quantity: { quantity: 1 },
  '-quantity': { quantity: -1 },
  stageEnteredAt: { stageEnteredAt: 1 },
  '-stageEnteredAt': { stageEnteredAt: -1 },
};

/** Escape user text for a safe RegExp literal. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every text-searchable path on `ArchiveLot`. Contacts include phone/email/address
 * (not just names); intake notes, photo meta, storage paths, rights, decision,
 * MLS, return and discard notes are all searchable from the register search box.
 * Numbers, dates, enums and ObjectIds are deliberately excluded — those have
 * dedicated filters/sort and regex-matching them causes false hits.
 */
export const LOT_TEXT_FIELDS: string[] = [
  'lotReference',
  'namingCode',
  'originSource',
  'owner.name',
  'owner.phone',
  'owner.email',
  'owner.address',
  'pointsOfContact.name',
  'pointsOfContact.phone',
  'pointsOfContact.email',
  'pointsOfContact.address',
  'facilitator.name',
  'facilitator.phone',
  'facilitator.email',
  'facilitator.address',
  'format',
  'dataType',
  'mediaSubtype',
  'quantityRemarks',
  'conditionNotes',
  'reasonForSending',
  'senderRemarks',
  'photoDate',
  'photoLocation',
  'photoEvent',
  'peopleInPhoto',
  'digitization.folderPath',
  'digitalFilePath',
  'rights.type',
  'rights.deedReference',
  'rights.notes',
  'decision.conditionIssue',
  'decision.significanceNotes',
  'decision.mlsMatchPaths',
  'mls.recordId',
  'mls.tagsApplied',
  'return.method',
  'return.trackingReference',
  'return.notes',
  'return.durationText',
  'discard.reason',
  'discard.notes',
];

/** Split free text into match tokens: drop 1-char noise, cap at 6 (regex-DoS guard). */
export function tokenizeQuery(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

/**
 * Text-match clauses for ONE token: case-insensitive contains over every
 * field in `LOT_TEXT_FIELDS`.
 */
export function lotTextOr(token: string): Record<string, unknown>[] {
  const rx = new RegExp(escapeRegex(token), 'i');
  return LOT_TEXT_FIELDS.map((path) => ({ [path]: rx }));
}

/** One `{ $or }` clause per token — a lot matches when EVERY token hits ANY field. */
export function buildTokenClauses(q: string): Record<string, unknown>[] {
  return tokenizeQuery(q).map((tok) => ({ $or: lotTextOr(tok) }));
}

/**
 * Merge per-token text clauses with id-based alternatives (receiver `_id`,
 * item-hit lot `_id`s). Single-token queries flatten into one `$or` so the
 * selective indexes stay usable; multi-token queries OR the whole text-AND
 * against each id alternative.
 */
export function mergeTextWithIdClauses(
  tokenClauses: Record<string, unknown>[],
  idClauses: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (tokenClauses.length === 0 && idClauses.length === 0) return null;
  if (tokenClauses.length === 0) {
    return idClauses.length === 1 ? idClauses[0]! : { $or: idClauses };
  }
  if (idClauses.length === 0) {
    return tokenClauses.length === 1 ? tokenClauses[0]! : { $and: tokenClauses };
  }
  if (tokenClauses.length === 1) {
    return { $or: [...(tokenClauses[0]!.$or as Record<string, unknown>[]), ...idClauses] };
  }
  return { $or: [{ $and: tokenClauses }, ...idClauses] };
}

/** Receiver `_id`s whose name matches ANY token (bounded; no `$lookup` on read paths). */
export async function findReceiverIdsForQuery(q: string, limit = 20): Promise<Types.ObjectId[]> {
  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return [];
  const or = tokens.map((tok) => ({ name: new RegExp(escapeRegex(tok), 'i') }));
  const users = await User.find({ $or: or }).select('_id').limit(limit).lean();
  return users.map((u) => u._id as Types.ObjectId);
}

function valueAtPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const rest = path.slice(path.indexOf(part));
      return cur.flatMap((el) => {
        const v = valueAtPath(el, rest);
        return Array.isArray(v) ? v : [v];
      });
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Client of `matchedVia`: true when EVERY token hits ANY text field on the lot
 * doc (mirrors `buildTokenClauses` without a database). Arrays (POCs,
 * `mlsMatchPaths`) count when any element matches.
 */
export function lotSideMatches(doc: unknown, q: string): boolean {
  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => {
    const rx = new RegExp(escapeRegex(tok), 'i');
    return LOT_TEXT_FIELDS.some((path) => {
      const v = valueAtPath(doc, path);
      const values = Array.isArray(v) ? v.flat(Infinity) : [v];
      return values.some((el) => typeof el === 'string' && rx.test(el));
    });
  });
}

export type LotFilterInput = {
  q?: string;
  stage?: string;
  decision?: string;
  format?: string;
  dataType?: string;
  receiver?: string;
  assignee?: string;
  projectId?: string;
  returnStatus?: string | string[];
  receivedFrom?: string;
  receivedTo?: string;
};

/**
 * Shared find() filter for register, queues and global search.
 * `q` becomes an AND of per-token `$or` clauses (every word must appear in
 * some text field). Pass `textOr` to replace the default `q` clauses (search
 * merges item lot-ids) — legacy path, kept for compatibility.
 */
export function buildLotFilter(
  query: LotFilterInput,
  textOr?: Record<string, unknown>[],
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (textOr) {
    if (textOr.length > 0) filter.$or = textOr;
  } else if (query.q) {
    const tokenClauses = buildTokenClauses(query.q);
    if (tokenClauses.length === 1) {
      filter.$or = tokenClauses[0]!.$or as Record<string, unknown>[];
    } else if (tokenClauses.length > 1) {
      filter.$and = tokenClauses;
    }
  }
  if (query.stage) filter.stage = query.stage;
  if (query.decision) filter['decision.status'] = query.decision;
  if (query.format) filter.format = query.format;
  if (query.dataType) filter.dataType = query.dataType;
  if (query.receiver && Types.ObjectId.isValid(query.receiver)) {
    filter.receiver = new Types.ObjectId(query.receiver);
  }
  if (query.assignee && Types.ObjectId.isValid(query.assignee)) {
    filter.assignee = new Types.ObjectId(query.assignee);
  }
  if (query.projectId && Types.ObjectId.isValid(query.projectId)) {
    filter.projectIds = new Types.ObjectId(query.projectId);
  }
  if (query.returnStatus) {
    filter['return.status'] = Array.isArray(query.returnStatus)
      ? { $in: query.returnStatus }
      : query.returnStatus;
  }
  if (query.receivedFrom || query.receivedTo) {
    filter.dateReceived = {
      ...(query.receivedFrom ? { $gte: new Date(query.receivedFrom) } : {}),
      ...(query.receivedTo ? { $lte: new Date(query.receivedTo) } : {}),
    };
  }
  return filter;
}

/** Paginated intake register (API.md §3). No $lookup — receiver names are batched after. */
export async function listLots(query: LotListQuery): Promise<LotListResponse> {
  await connectToDatabase();

  // Chips first; text (with receiver-name alternative) merges on top so the
  // receiver's name is searchable even though only the ObjectId is stored.
  const { q, arrival: _arrival, ...chipQuery } = query;
  const filter = buildLotFilter(chipQuery);
  if (q) {
    const tokenClauses = buildTokenClauses(q);
    const receiverIds = await findReceiverIdsForQuery(q);
    const textFilter = mergeTextWithIdClauses(
      tokenClauses,
      receiverIds.length > 0 ? [{ receiver: { $in: receiverIds } }] : [],
    );
    if (textFilter) Object.assign(filter, textFilter);
  }

  // My lots split: one indexed read of the assignee's pickup flags, then $in / $nin on _id (no $lookup).
  if (query.arrival && query.assignee && Types.ObjectId.isValid(query.assignee)) {
    const picked = await LotPickup.find({ user: new Types.ObjectId(query.assignee) })
      .select('lot')
      .lean();
    const ids = picked.map((p) => p.lot);
    filter._id = query.arrival === 'accepted' ? { $in: ids } : { $nin: ids };
  }

  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    ArchiveLot.find(filter)
      .sort(SORT_MAP[query.sort] ?? { dateReceived: -1 })
      .skip(skip)
      .limit(query.pageSize)
      .lean(),
    ArchiveLot.countDocuments(filter),
  ]);

  // One batched User read for every receiver on the page (rule 4: no $lookup).
  const receiverIds = [...new Set(docs.map((d) => String(d.receiver)))];
  const users = await User.find({ _id: { $in: receiverIds } })
    .select('name')
    .lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));

  const rows = docs.map((d) => ({
    id: String(d._id),
    lotReference: d.lotReference,
    namingCode: d.namingCode ?? null,
    dateReceived: d.dateReceived ? d.dateReceived.toISOString() : null,
    ownerName: d.owner?.name ?? '',
    assigneeName: d.assigneeName ?? null,
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
  }));

  return { rows, total, page: query.page, pageSize: query.pageSize };
}

/** Full record for the detail screen: lot, resolved names, item counts, attachment count. */
export async function getLotDetail(lotId: string): Promise<LotDetailResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');

  const doc = await ArchiveLot.findById(lotId).lean();
  if (!doc) throw new HttpError(404, 'Lot not found.');

  const subtypeKey = mediaSubtypeListKey(doc.format);
  const userIds = [
    doc.receiver,
    doc.decision?.decidedBy,
    doc.decision?.overrideRequestedBy,
    doc.decision?.overrideApprovedBy,
    doc.digitization?.scannedBy,
    doc.return?.handledBy,
    doc.discard?.discardedBy,
  ].filter((id): id is Types.ObjectId => id != null);
  /**
   * Who moved the lot into its current stage. Every stage transition writes an
   * audit entry through withAudit(); the latest entry of the kind that caused
   * the entry carries the actor. `actorName` is denormalised on the entry, so
   * this is one indexed range read — no $lookup.
   */
  const entryKinds: string[] = STAGE_ENTRY_KINDS[doc.stage] ?? [];
  const [mediaSubtypeLabel, rightsTypeLabel, users, counts, lineStatRows, attachmentCount, stageTrail] =
    await Promise.all([
      subtypeKey ? resolveReferenceLabel(subtypeKey, doc.mediaSubtype) : doc.mediaSubtype,
      doc.rights?.type ? resolveReferenceLabel('rightsType', doc.rights.type) : null,
      // One batched fetch, no $lookup: receiver + everyone who touched the decision.
      User.find({ _id: { $in: userIds } }).select('name').lean(),
      LotItem.aggregate<{ _id: null; total: number; selected: number; digitized: number; tagged: number; duplicates: number }>([
        { $match: { lot: doc._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            selected: { $sum: { $cond: ['$selectedForDigitization', 1, 0] } },
            digitized: { $sum: { $cond: ['$digitized', 1, 0] } },
            tagged: { $sum: { $cond: ['$taggedInMls', 1, 0] } },
            duplicates: { $sum: { $cond: ['$mlsDuplicate', 1, 0] } },
          },
        },
      ]),
      // Per-media-type progress (F2): same counters as above, grouped by line.
      LotItem.aggregate<{ _id: number | null; total: number; selected: number; digitized: number; tagged: number }>([
        { $match: { lot: doc._id } },
        {
          $group: {
            _id: '$lineIndex',
            total: { $sum: 1 },
            selected: { $sum: { $cond: ['$selectedForDigitization', 1, 0] } },
            digitized: { $sum: { $cond: ['$digitized', 1, 0] } },
            tagged: { $sum: { $cond: ['$taggedInMls', 1, 0] } },
          },
        },
      ]),
      Attachment.countDocuments({ lot: doc._id }),
      ActivityLog.find({ lot: doc._id, kind: { $in: entryKinds } })
        .select('kind actorName at')
        .sort({ at: -1 })
        .limit(5)
        .lean(),
    ]);
  const stageEnteredByName = stageTrail[0]?.actorName ?? null;

  const c = counts[0] ?? { total: 0, selected: 0, digitized: 0, tagged: 0, duplicates: 0 };
  const lineStats = lineStatRows
    .map((s) => ({
      lineIndex: s._id ?? 0,
      total: s.total,
      selected: s.selected,
      digitized: s.digitized,
      tagged: s.tagged,
    }))
    .sort((a, b) => a.lineIndex - b.lineIndex);
  /**
   * Per-line sub-type labels. Lines are grouped by their format's list key so
   * each reference list is read once, not once per line.
   */
  const rawLines = (doc.mediaLines ?? []) as {
    format: string;
    dataType: string;
    mediaSubtype: string;
    quantity: number;
    quantityToDigitize: number;
    quantityAlreadyDigitized: number;
    notDigitizedReason?: string | null;
    quantityRemarks?: string | null;
  }[];
  const keyByIndex = rawLines.map((l) => mediaSubtypeListKey(l.format));
  const distinctKeys = [...new Set(keyByIndex.filter((k): k is string => k != null))];
  const labelByKeyValue = new Map<string, string>();
  await Promise.all(
    distinctKeys.map(async (key) => {
      const items = await getReferenceList(key);
      for (const item of items) labelByKeyValue.set(`${key}::${item.value}`, item.label);
    }),
  );
  const mediaLines = rawLines.map((l, i) => {
    const key = keyByIndex[i];
    return {
      format: l.format,
      dataType: l.dataType,
      mediaSubtype: l.mediaSubtype,
      mediaSubtypeLabel:
        (key ? labelByKeyValue.get(`${key}::${l.mediaSubtype}`) : undefined) ?? l.mediaSubtype,
      quantity: l.quantity,
      quantityToDigitize: l.quantityToDigitize,
      quantityAlreadyDigitized: l.quantityAlreadyDigitized,
      notDigitizedReason: l.notDigitizedReason ?? null,
      quantityRemarks: l.quantityRemarks ?? null,
    };
  });
  let syncProject: { id: string; code: string; name: string; siblingCount: number } | null = null;
  if (doc.syncProjectId) {
    const [proj, siblingCount] = await Promise.all([
      Project.findById(doc.syncProjectId).select('code name').lean(),
      ArchiveLot.countDocuments({ syncProjectId: doc.syncProjectId }),
    ]);
    if (proj) {
      syncProject = { id: String(proj._id), code: proj.code, name: proj.name, siblingCount };
    }
  }
  const nameById = new Map(users.map((u) => [String(u._id), u.name as string]));
  const userName = (id: Types.ObjectId | null | undefined): string | null =>
    id == null ? null : (nameById.get(String(id)) ?? 'Unknown');
  const contact = (x: { name: string; phone?: string | null; email?: string | null; address?: string | null } | null | undefined) =>
    x
      ? {
          name: x.name,
          phone: x.phone ?? null,
          email: x.email ?? null,
          address: x.address ?? null,
        }
      : null;

  return {
    lot: {
      id: String(doc._id),
      lotReference: doc.lotReference,
      namingCode: doc.namingCode ?? null,
      originSource: doc.originSource ?? null,
      dateReceived: doc.dateReceived ? doc.dateReceived.toISOString() : null,
      receiver: { id: String(doc.receiver), name: userName(doc.receiver) ?? 'Unknown' },
      owner: contact(doc.owner) ?? { name: '', phone: null, email: null, address: null },
      pointsOfContact: (doc.pointsOfContact ?? []).map((p) => contact(p)!),
      referencePeople: (doc.referencePeople ?? []).map((p) => ({ name: p.name, phone: p.phone })),
      facilitator: contact(doc.facilitator ?? null),
      format: doc.format,
      dataType: doc.dataType,
      mediaSubtype: doc.mediaSubtype,
      mediaSubtypeLabel,
      quantity: doc.quantity,
      quantityToDigitize: doc.quantityToDigitize,
      quantityAlreadyDigitized: doc.quantityAlreadyDigitized,
      quantityRemarks: doc.quantityRemarks ?? null,
      mediaLines,
      lineStats,
      conditionNotes: doc.conditionNotes ?? null,
      conditionPhotoUrl: doc.conditionPhotoUrl ?? null,
      reasonForSending: doc.reasonForSending ?? null,
      senderRemarks: doc.senderRemarks ?? null,
      photoDate: doc.photoDate ?? null,
      photoLocation: doc.photoLocation ?? null,
      photoEvent: doc.photoEvent ?? null,
      peopleInPhoto: doc.peopleInPhoto ?? null,
      digitalFilePath: doc.digitalFilePath ?? null,
      physicalLabelApplied: doc.physicalLabelApplied ?? false,
      containerLabelApplied: doc.containerLabelApplied ?? false,
      rights: {
        type: doc.rights?.type ?? null,
        typeLabel: rightsTypeLabel,
        deedReference: doc.rights?.deedReference ?? null,
        notes: doc.rights?.notes ?? null,
      },
      stage: doc.stage,
      stageEnteredAt: doc.stageEnteredAt.toISOString(),
      stageEnteredByName,
      decision: doc.decision?.status ?? 'pending',
      decisionDetail: {
        status: doc.decision?.status ?? 'pending',
        verdict: (doc.decision?.verdict ?? null) as 'archive' | 'return_or_discard' | null,
        decidedByName: userName(doc.decision?.decidedBy),
        decidedAt: doc.decision?.decidedAt ? new Date(doc.decision.decidedAt).toISOString() : null,
        existsInMls: doc.decision?.existsInMls ?? null,
        newCopyIsBetter: doc.decision?.newCopyIsBetter ?? null,
        conditionUsable: doc.decision?.conditionUsable ?? null,
        conditionIssue: doc.decision?.conditionIssue ?? null,
        mlsMatchPaths: doc.decision?.mlsMatchPaths ? [...doc.decision.mlsMatchPaths] : [],
        significanceFlags: doc.decision?.significanceFlags ? [...doc.decision.significanceFlags] : null,
        notes: doc.decision?.significanceNotes ?? null,
        overrideStatus: doc.decision?.overrideStatus ?? 'none',
        overrideRequestedByName: userName(doc.decision?.overrideRequestedBy),
        overrideApprovedByName: userName(doc.decision?.overrideApprovedBy),
      },
      itemCounts: {
        total: c.total,
        selected: c.selected,
        digitized: c.digitized,
        tagged: c.tagged,
        duplicates: c.duplicates,
      },
      ops: {
        scanStatus: doc.digitization?.scanStatus ?? 'pending',
        scannedByName: userName(doc.digitization?.scannedBy),
        scanDate: doc.digitization?.scanDate
          ? new Date(doc.digitization.scanDate).toISOString()
          : null,
        folderPath: doc.digitization?.folderPath ?? null,
        expectedFileCount: doc.digitization?.expectedFileCount ?? 0,
        foundFileCount: doc.digitization?.foundFileCount ?? 0,
        lastReconciledAt: doc.digitization?.lastReconciledAt
          ? new Date(doc.digitization.lastReconciledAt).toISOString()
          : null,
        mlsRecordId: doc.mls?.recordId ?? null,
        mlsTaggedCount: doc.mls?.taggedCount ?? 0,
        mlsTagsApplied: doc.mls?.tagsApplied ?? null,
        mlsDataListAttached: doc.mls?.dataListAttached ?? false,
        mlsDuplicatesFound: doc.mls?.duplicatesFound ?? 0,
        mlsDuplicateAction: doc.mls?.duplicateAction ?? null,
        returnStatus: doc.return?.status ?? 'not_requested',
        returnFormat: doc.return?.format ?? 'none',
        returnRequested: doc.return?.requested ?? false,
        returnDuration: doc.return?.durationText ?? null,
        returnDueAt: doc.return?.dueAt ? new Date(doc.return.dueAt).toISOString() : null,
        returnedAt: doc.return?.returnedAt ? new Date(doc.return.returnedAt).toISOString() : null,
        returnHandledByName: userName(doc.return?.handledBy),
        returnMethod: doc.return?.method ?? null,
        discardReason: doc.discard?.reason ?? null,
        discardedByName: userName(doc.discard?.discardedBy),
        discardedAt: doc.discard?.discardedAt ? new Date(doc.discard.discardedAt).toISOString() : null,
        discardNotes: doc.discard?.notes ?? null,
      },
      attachmentCount,
      syncProject,
      assignee: doc.assignee
        ? { id: String(doc.assignee), name: doc.assigneeName ?? userName(doc.assignee) ?? 'Unknown' }
        : null,
      intakeMissing: intakeMissing(doc),
      version: doc.__v ?? 0,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    },
  };
}

/** True when a lot sits in a finished stage — edits then need `lot:editTerminal`. */
export function isTerminalStage(stage: string): boolean {
  return (TERMINAL_STAGES as string[]).includes(stage);
}

/** Paginated items of one lot (API.md §5). Filters mirror the MLS tagging screen. */
export async function listItems(
  lotId: string,
  query: ItemsQuery,
): Promise<ItemsResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const filter: Record<string, unknown> = { lot: new Types.ObjectId(lotId) };
  if (query.groupNo !== undefined) filter.groupNo = query.groupNo;
  if (query.digitized !== undefined) filter.digitized = query.digitized === 'true';
  if (query.taggedInMls !== undefined) filter.taggedInMls = query.taggedInMls === 'true';
  if (query.mlsDuplicate !== undefined) filter.mlsDuplicate = query.mlsDuplicate === 'true';

  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    LotItem.find(filter).sort({ groupNo: 1, itemNo: 1 }).skip(skip).limit(query.pageSize).lean(),
    LotItem.countDocuments(filter),
  ]);
  return {
    rows: docs.map((d) => ({
      id: String(d._id),
      code: d.code,
      groupNo: d.groupNo,
      itemNo: d.itemNo,
      lineIndex: d.lineIndex ?? 0,
      selectedForDigitization: d.selectedForDigitization,
      digitized: d.digitized,
      taggedInMls: d.taggedInMls,
      mlsDuplicate: d.mlsDuplicate,
      mlsDuplicateOf: d.mlsDuplicateOf ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Every item of one lot, unsliced, with per-line subtype labels (decision triage). */
export async function listTriageItems(lotId: string): Promise<TriageItemsResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const [doc, items] = await Promise.all([
    ArchiveLot.findById(lotId).lean(),
    LotItem.find({ lot: new Types.ObjectId(lotId) })
      .sort({ groupNo: 1, itemNo: 1 })
      .lean(),
  ]);
  if (!doc) throw new HttpError(404, 'Lot not found.');

  const rawLines = (doc.mediaLines ?? []) as { format: string; mediaSubtype: string }[];
  const keyByIndex = rawLines.map((l) => mediaSubtypeListKey(l.format));
  const distinctKeys = [...new Set(keyByIndex.filter((k): k is string => k != null))];
  const labelByKeyValue = new Map<string, string>();
  await Promise.all(
    distinctKeys.map(async (key) => {
      const list = await getReferenceList(key);
      for (const item of list) labelByKeyValue.set(`${key}::${item.value}`, item.label);
    }),
  );
  const labelFor = (lineIndex: number): { subtype: string; subtypeLabel: string } => {
    const line = rawLines[lineIndex] ?? rawLines[0];
    if (!line) return { subtype: 'unspecified', subtypeLabel: 'Unspecified' };
    const key = mediaSubtypeListKey(line.format);
    return {
      subtype: line.mediaSubtype,
      subtypeLabel:
        (key ? labelByKeyValue.get(`${key}::${line.mediaSubtype}`) : undefined) ??
        line.mediaSubtype,
    };
  };

  return {
    items: items.map((d) => ({
      id: String(d._id),
      code: d.code,
      groupNo: d.groupNo,
      itemNo: d.itemNo,
      lineIndex: d.lineIndex ?? 0,
      ...labelFor(d.lineIndex ?? 0),
      selectedForDigitization: d.selectedForDigitization,
      notDigitizedReason: d.notDigitizedReason ?? null,
      digitized: d.digitized,
      taggedInMls: d.taggedInMls,
    })),
    total: items.length,
    version: doc.__v ?? 0,
  };
}

/** Per-record audit trail, newest first (API.md §5). */
export async function listActivity(
  lotId: string,
  query: ActivityQuery,
): Promise<ActivityResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const filter = { lot: new Types.ObjectId(lotId) };
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    ActivityLog.find(filter).sort({ at: -1 }).skip(skip).limit(query.pageSize).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  return {
    rows: docs.map((d) => ({
      id: String(d._id),
      kind: d.kind,
      title: d.title,
      detail: d.detail ?? null,
      actorName: d.actorName,
      at: d.at.toISOString(),
      mediaSubtype: d.mediaSubtype ?? null,
      mediaLineIndex: d.mediaLineIndex ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
