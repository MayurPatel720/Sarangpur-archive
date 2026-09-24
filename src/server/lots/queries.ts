import { Types } from 'mongoose';
import { TERMINAL_STAGES } from '@/lib/domain';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { ActivityLog } from '@/models/ActivityLog';
import { Attachment } from '@/models/Attachment';
import { User } from '@/models/User';
import { resolveReferenceLabel } from '@/server/reference';
import { subtypeListKeyForFormat, subtypeListKeySync } from '@/server/reference/runtime';
import type { LotDetailResponse, LotListQuery, LotListResponse } from '@/types/lot';
import type { ItemsQuery, ItemsResponse, ActivityQuery, ActivityResponse } from '@/types/ops';

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

function returnSeverity(lot: ArchiveLotDoc): 'neutral' | 'info' | 'good' | 'warning' | 'critical' {
  const status = lot.return?.status ?? 'not_requested';
  if (status === 'returned') return 'good';
  if ((status === 'pending' || status === 'in_progress') && lot.return?.dueAt) {
    if (new Date(lot.return.dueAt).getTime() < Date.now()) return 'warning';
    return 'info';
  }
  return 'neutral';
}

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
 * Text-match clauses for register + global search. Case-insensitive contains.
 * Prefer an anchored uppercase prefix on `LotItem.code` separately when the query
 * looks like an item code — that can use the unique index.
 */
export function lotTextOr(q: string): Record<string, unknown>[] {
  const rx = new RegExp(escapeRegex(q), 'i');
  return [
    { 'owner.name': rx },
    { lotReference: rx },
    { namingCode: rx },
    { 'pointsOfContact.name': rx },
    { 'facilitator.name': rx },
    { 'digitization.folderPath': rx },
    { 'rights.deedReference': rx },
  ];
}

export type LotFilterInput = {
  q?: string;
  stage?: string;
  decision?: string;
  format?: string;
  dataType?: string;
  receiver?: string;
  returnStatus?: string | string[];
  receivedFrom?: string;
  receivedTo?: string;
};

/**
 * Shared find() filter for register, queues and global search.
 * Pass `textOr` to replace the default `q` clauses (search merges item lot-ids).
 */
export function buildLotFilter(
  query: LotFilterInput,
  textOr?: Record<string, unknown>[],
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const or = textOr ?? (query.q ? lotTextOr(query.q) : null);
  if (or && or.length > 0) filter.$or = or;
  if (query.stage) filter.stage = query.stage;
  if (query.decision) filter['decision.status'] = query.decision;
  if (query.format) filter.format = query.format;
  if (query.dataType) filter.dataType = query.dataType;
  if (query.receiver && Types.ObjectId.isValid(query.receiver)) {
    filter.receiver = new Types.ObjectId(query.receiver);
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

  const filter = buildLotFilter(query);

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
  const [mediaSubtypeLabel, rightsTypeLabel, users, counts, attachmentCount] =
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
      Attachment.countDocuments({ lot: doc._id }),
    ]);

  const c = counts[0] ?? { total: 0, selected: 0, digitized: 0, tagged: 0, duplicates: 0 };
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
      dateReceived: doc.dateReceived.toISOString(),
      receiver: { id: String(doc.receiver), name: userName(doc.receiver) ?? 'Unknown' },
      owner: contact(doc.owner)!,
      pointsOfContact: (doc.pointsOfContact ?? []).map((p) => contact(p)!),
      facilitator: contact(doc.facilitator ?? null),
      format: doc.format,
      dataType: doc.dataType,
      mediaSubtype: doc.mediaSubtype,
      mediaSubtypeLabel,
      quantity: doc.quantity,
      quantityToDigitize: doc.quantityToDigitize,
      quantityAlreadyDigitized: doc.quantityAlreadyDigitized,
      quantityRemarks: doc.quantityRemarks ?? null,
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
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
