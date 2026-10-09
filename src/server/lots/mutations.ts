import { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import type { MutationContext } from '@/lib/api';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { ActivityLog } from '@/models/ActivityLog';
import { can } from '@/server/permissions';
import { withAudit, auditActor } from '@/server/audit';
import { LOT_PATCH_SHARED_KEYS, propagateFromLot } from '@/server/projects/sync';
import { intakeMissing } from '@/lib/intake-gate';
import { assertActiveReferenceValue, getActiveReferenceItems, getReferenceList, bumpUsage, transferUsage } from '@/server/reference';
import { mediaSubtypeListKeyAsync } from '@/server/lots/queries';
import { assertActive } from '@/server/reference/runtime';
import { computeVerdict, unionSignificanceFlags, type SignificanceFlags, type Verdict } from '@/server/lots/decision-rule';
import { allocateItemCodes, generateLotReference, generateNamingCode, itemSlot, FORMAT_DEFAULT_PREFIX } from '@/server/codes';
import { isTerminalStage } from '@/server/lots/queries';
import type { Stage } from '@/lib/domain';
import type { LotCreateBody, LotPatchBody, DecisionBody, DecisionResponse, OverrideRequestBody, OverrideDecideBody } from '@/types/lot';
import type { TriageBulkBody } from '@/types/triage';

async function subtypeLabel(format: string, value: string): Promise<string> {
  const key = await mediaSubtypeListKeyAsync(format);
  if (!key) return value;
  const items = await getReferenceList(key);
  return items.find((i) => i.value === value)?.label ?? value;
}

/**
 * Intake body as the core insert sees it. Standalone intake (`createIntake`)
 * always supplies `dateReceived`/`originSource`/`owner` (the API schema requires
 * them); a project child lot may not know them yet, so they are optional here
 * and the Intake→Decision gate blocks the lot until they are filled.
 */
export type LotInsertBody = Omit<LotCreateBody, 'dateReceived' | 'originSource' | 'owner'> & {
  dateReceived?: string | null;
  originSource?: string | null;
  owner?: LotCreateBody['owner'] | null;
};

export interface LotInsertExtras {
  syncProjectId?: Types.ObjectId | null;
  projectIds?: Types.ObjectId[];
  assignee?: { id: string; name: string } | null;
}

interface NormalisedLine {
  format: string;
  dataType: string;
  mediaSubtype: string;
  quantity: number;
  quantityToDigitize: number;
  quantityAlreadyDigitized: number;
  notDigitizedReason: string | null;
  quantityRemarks: string | null;
}

/** Normalises media lines and rejects retired/unknown vocabulary — runs BEFORE the transaction. */
export async function validateLotVocab(
  body: LotInsertBody,
): Promise<{ lines: NormalisedLine[]; subtypeKeys: (string | null)[] }> {
  const lines: NormalisedLine[] = body.mediaLines.map((l) => ({
    format: l.format,
    dataType: l.dataType,
    mediaSubtype: l.mediaSubtype,
    quantity: l.quantity,
    quantityToDigitize: l.quantityToDigitize ?? 0,
    quantityAlreadyDigitized: l.quantityAlreadyDigitized ?? 0,
    notDigitizedReason: l.notDigitizedReason ?? null,
    quantityRemarks: l.quantityRemarks ?? null,
  }));
  await Promise.all([
    body.originSource ? assertActiveReferenceValue('originSource', body.originSource) : Promise.resolve(),
    body.returnFormat ? assertActiveReferenceValue('returnFormat', body.returnFormat) : Promise.resolve(),
    body.rights?.type ? assertActiveReferenceValue('rightsType', body.rights.type) : Promise.resolve(),
    ...lines.flatMap((l) => [
      assertActiveReferenceValue('format', l.format),
      assertActiveReferenceValue('dataType', l.dataType),
      ...(l.notDigitizedReason
        ? [assertActiveReferenceValue('notDigitizedReason', l.notDigitizedReason)]
        : []),
    ]),
  ]);
  const subtypeKeys = await Promise.all(lines.map((l) => mediaSubtypeListKeyAsync(l.format)));
  await Promise.all(
    lines.map((l, i) =>
      subtypeKeys[i] ? assertActiveReferenceValue(subtypeKeys[i]!, l.mediaSubtype) : Promise.resolve(),
    ),
  );
  return { lines, subtypeKeys };
}

/**
 * One item document per unit of every media line. Codes come from the item's OWN
 * sub-type (`MDV-AHM-0002-R-000`), so a lot with mixed sub-types gets mixed prefixes.
 * Group/position are a running 36-per-group index across the lot; each line's first
 * `quantityToDigitize` items are selected for digitizing.
 */
async function buildItemDocs(
  lotId: Types.ObjectId,
  lines: NormalisedLine[],
  origin: string,
  session: ClientSession,
): Promise<Record<string, unknown>[]> {
  const docs: Record<string, unknown>[] = [];
  const pending = new Map<string, number>();
  let n = 0;
  for (const [lineIndex, line] of lines.entries()) {
    // Default pair (sub-type prefix + origin); the user can change both from the Excel.
    const prefix = await namingPrefix(line.format, line.mediaSubtype);
    const codes = await allocateItemCodes(prefix, origin, line.quantity, session, pending);
    codes.forEach((code, idx) => {
      const selected = idx < line.quantityToDigitize;
      docs.push({
        lot: lotId,
        code,
        format: line.format,
        ...itemSlot(n),
        sortOrder: n,
        lineIndex,
        selectedForDigitization: selected,
        notDigitizedReason: selected ? null : line.notDigitizedReason,
        // Physical + Digital media: a digital copy already exists, so the Decision band's
        // "Digital" answer starts as Yes (still editable).
        ...(line.dataType === 'both' ? { decision: { digital: true } } : {}),
      });
      n += 1;
    });
  }
  return docs;
}

/**
 * Inserts one lot + its items + vocabulary usage + audit entries INSIDE the caller's
 * transaction (SPEC §4.4): allocates the lotReference, inserts the lot,
 * bulk-inserts one LotItem per unit of quantity (each line's first
 * `quantityToDigitize` items selected, carrying that line's `lineIndex`), bumps
 * usage, and writes one `intake_created` entry per media line.
 *
 * The legacy top-level media fields are derived — primary = first line,
 * quantities = across-lines sums — so every existing pipeline keeps working.
 */
export async function insertLotInSession(
  body: LotInsertBody,
  vocab: { lines: NormalisedLine[]; subtypeKeys: (string | null)[] },
  ctx: MutationContext,
  session: ClientSession,
  extras: LotInsertExtras = {},
): Promise<{ id: string; lotReference: string; format: string; itemsCreated: number }> {
  const { lines, subtypeKeys } = vocab;
  const primary = lines[0]!;
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalToDigitize = lines.reduce((sum, l) => sum + l.quantityToDigitize, 0);
  const totalAlreadyDigitized = lines.reduce((sum, l) => sum + l.quantityAlreadyDigitized, 0);

  const lotReference = await generateLotReference(session);
  const [lot] = await ArchiveLot.create(
    [
      {
        lotReference,
        originSource: body.originSource ?? undefined,
        dateReceived: body.dateReceived ? new Date(body.dateReceived) : null,
        receiver: new Types.ObjectId(ctx.userId),
        owner: body.owner ?? undefined,
        pointsOfContact: body.pointsOfContact ?? [],
        referencePeople: body.referencePeople ?? [],
        facilitator: body.facilitator ?? null,
        format: primary.format,
        dataType: primary.dataType,
        mediaSubtype: primary.mediaSubtype,
        quantity: totalQuantity,
        quantityToDigitize: totalToDigitize,
        quantityAlreadyDigitized: totalAlreadyDigitized,
        quantityRemarks: primary.quantityRemarks,
        mediaLines: lines,
        conditionNotes: body.conditionNotes,
        conditionPhotoUrl: body.conditionPhotoUrl,
        reasonForSending: body.reasonForSending,
        senderRemarks: body.senderRemarks,
        photoDate: body.photoDate ?? null,
        photoLocation: body.photoLocation ?? null,
        photoEvent: body.photoEvent ?? null,
        peopleInPhoto: body.peopleInPhoto ?? null,
        digitalFilePath: body.digitalFilePath ?? null,
        physicalLabelApplied: body.physicalLabelApplied ?? false,
        containerLabelApplied: body.containerLabelApplied ?? false,
        rights: {
          type: body.rights?.type ?? null,
          deedReference: body.rights?.deedReference ?? null,
          notes: body.rights?.notes ?? null,
        },
        return: {
          requested: body.returnRequested ?? false,
          format: body.returnFormat ?? 'none',
          durationText: body.returnDuration ?? null,
          dueAt: body.returnDueAt ? new Date(body.returnDueAt) : null,
          status: body.returnRequested ? 'pending' : 'not_requested',
          returnedAt: null,
          method: null,
          handledBy: null,
          trackingReference: null,
          notes: null,
        },
        projectIds: extras.projectIds ?? [],
        syncProjectId: extras.syncProjectId ?? null,
        assignee: extras.assignee ? new Types.ObjectId(extras.assignee.id) : null,
        assigneeName: extras.assignee?.name ?? null,
        stage: 'intake',
        stageEnteredAt: new Date(),
      },
    ],
    { session },
  );
  lot!.set('digitization.expectedFileCount', totalToDigitize);
  await lot!.save({ session });

  const docs = await buildItemDocs(lot!._id, lines, body.originSource ?? 'OTH', session);
  for (let i = 0; i < docs.length; i += 2000) {
    await LotItem.insertMany(docs.slice(i, i + 2000), { session });
  }

  // usageCount for open-list values the lot will never change again.
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (subtypeKeys[i]) await bumpUsage(subtypeKeys[i]!, line.mediaSubtype, session);
  }
  if (body.rights?.type) await bumpUsage('rightsType', body.rights.type, session);
  if (body.originSource) await bumpUsage('originSource', body.originSource, session);
  for (const value of new Set(lines.map((l) => l.format))) {
    await bumpUsage('format', value, session);
  }
  for (const value of new Set(lines.map((l) => l.dataType))) {
    await bumpUsage('dataType', value, session);
  }
  if (body.returnFormat) await bumpUsage('returnFormat', body.returnFormat, session);
  for (const value of new Set(lines.map((l) => l.notDigitizedReason).filter((r): r is string => r != null))) {
    await bumpUsage('notDigitizedReason', value, session);
  }

  const actorId = new Types.ObjectId(ctx.userId);
  const now = new Date();
  const entries = await Promise.all(
    lines.map(async (line, i) => ({
      lot: lot!._id,
      lotCode: lotReference,
      // Per-line format: a multi-line intake logs each line under the
      // format it actually belongs to. Write-time denormalisation.
      format: line.format,
      kind: 'intake_created',
      title: lines.length > 1 ? `Intake created — line ${i + 1}` : 'Intake created',
      detail: `${line.quantity} items · ${await subtypeLabel(line.format, line.mediaSubtype)}${lines.length > 1 ? ` (${i + 1} of ${lines.length})` : ''}.${extras.syncProjectId ? ' Created from a project.' : ' Condition photo attached.'}`,
      mediaSubtype: line.mediaSubtype,
      mediaLineIndex: i,
      actor: actorId,
      actorName: ctx.userName,
      at: now,
      changes: [],
    })),
  );
  if (extras.assignee) {
    entries.push({
      lot: lot!._id,
      lotCode: lotReference,
      format: primary.format,
      kind: 'lot_assigned',
      title: `Assigned to ${extras.assignee.name}`,
      detail: '',
      mediaSubtype: primary.mediaSubtype,
      mediaLineIndex: 0,
      actor: actorId,
      actorName: ctx.userName,
      at: now,
      changes: [],
    });
  }
  await ActivityLog.create(entries, { session, ordered: true });

  return { id: String(lot!._id), lotReference, format: primary.format, itemsCreated: totalQuantity };
}

/** Standalone intake: one lot in its own transaction. */
export async function createIntake(
  body: LotCreateBody,
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; itemsCreated: number }> {
  const vocab = await validateLotVocab(body);
  await connectToDatabase();
  const session = await ArchiveLot.startSession();
  try {
    let out!: { id: string; lotReference: string; itemsCreated: number };
    await session.withTransaction(async () => {
      out = await insertLotInSession(body, vocab, ctx, session);
    });
    return { id: out.id, lotReference: out.lotReference, itemsCreated: out.itemsCreated };
  } finally {
    await session.endSession();
  }
}

/**
 * Replace a lot's media lines (add / edit / remove rows, change quantities) while it
 * is still in Intake. Intake lots have no scan or MLS data yet, so the items are
 * simply regenerated from the new lines — refused if any item already carries a
 * file name or progress (which cannot be reproduced). Project child lots stay
 * single-format. Route permission: `lot:edit`; the assignee rule applies.
 */
export async function replaceMediaLines(
  lotId: string,
  body: { version: number; mediaLines: LotCreateBody['mediaLines'] },
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; quantity: number; version: number }> {
  const vocab = await validateLotVocab({ mediaLines: body.mediaLines } as LotInsertBody);
  const { lines, subtypeKeys } = vocab;
  const total = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (total > 20000) throw new HttpError(400, 'Total quantity across media lines cannot exceed 20000.');

  const { id, lotReference } = await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'intake_updated',
    title: 'Media lines updated',
    mutate: async (lot, session) => {
      if ((lot.__v ?? 0) !== body.version) {
        throw new HttpError(409, 'This record changed since you opened it. Reload and try again.');
      }
      if (lot.stage !== 'intake') {
        throw new HttpError(400, 'Quantities can only be changed while the lot is still in Intake.');
      }
      if (lot.syncProjectId && lines.some((l) => l.format !== lot.format)) {
        throw new HttpError(400, `This lot is the ${lot.format} lot of its project — every line must be ${lot.format}.`);
      }
      const touched = await LotItem.countDocuments({
        lot: lot._id,
        $or: [
          { digitized: true },
          { taggedInMls: true },
          { fileName: { $ne: null } },
          { senderCode: { $nin: [null, ''] } },
          { nameOnTape: { $nin: [null, ''] } },
          { nameOnCase: { $nin: [null, ''] } },
          { place: { $nin: [null, ''] } },
          { duplicateCode: { $nin: [null, ''] } },
          { 'decision.verdict': { $ne: null } },
        ],
      }).session(session);
      if (touched > 0) {
        throw new HttpError(
          409,
          'Items on this lot already have details, decisions or files, so the quantities are locked. Use "Add item" in the Items tab instead.',
        );
      }

      const primary = lines[0]!;
      const toDigitize = lines.reduce((sum, l) => sum + l.quantityToDigitize, 0);
      lot.format = primary.format;
      lot.dataType = primary.dataType;
      lot.mediaSubtype = primary.mediaSubtype;
      lot.quantity = total;
      lot.quantityToDigitize = toDigitize;
      lot.quantityAlreadyDigitized = lines.reduce((sum, l) => sum + l.quantityAlreadyDigitized, 0);
      lot.quantityRemarks = primary.quantityRemarks ?? undefined;
      lot.set('mediaLines', lines);
      lot.set('digitization.expectedFileCount', toDigitize);

      await LotItem.deleteMany({ lot: lot._id }, { session });
      const docs = await buildItemDocs(lot._id, lines, lot.originSource ?? 'OTH', session);
      for (let i = 0; i < docs.length; i += 2000) {
        await LotItem.insertMany(docs.slice(i, i + 2000), { session });
      }
      for (let i = 0; i < lines.length; i += 1) {
        if (subtypeKeys[i]) await bumpUsage(subtypeKeys[i]!, lines[i]!.mediaSubtype, session);
      }
      return { id: String(lot._id), lotReference: lot.lotReference };
    },
  });
  const fresh = await ArchiveLot.findById(id).select('__v quantity').lean();
  return { id, lotReference, quantity: fresh?.quantity ?? total, version: fresh?.__v ?? 0 };
}

/**
 * Partial intake-field update through `withAudit()` (kind `intake_updated`).
 * Optimistic concurrency via `__v`; terminal-stage lots need `lot:editTerminal`.
 */
export async function patchLot(
  lotId: string,
  body: LotPatchBody,
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; version: number }> {
  if (body.originSource) {
    await assertActiveReferenceValue('originSource', body.originSource);
  }
  if (body.format) {
    await assertActiveReferenceValue('format', body.format);
  }
  if (body.dataType) {
    await assertActiveReferenceValue('dataType', body.dataType);
  }
  if (body.notDigitizedReason) {
    await assertActiveReferenceValue('notDigitizedReason', body.notDigitizedReason);
  }
  if (body.mediaSubtype) {
    // Format may change in the same PATCH — validate against the NEW format.
    const current = await ArchiveLot.findById(lotId).select('format').lean();
    if (!current) throw new HttpError(404, 'Lot not found.');
    const formatForValidation = body.format ?? current.format;
    const key = await mediaSubtypeListKeyAsync(formatForValidation);
    if (key) await assertActiveReferenceValue(key, body.mediaSubtype);
  }
  if (body.rights?.type) {
    await assertActiveReferenceValue('rightsType', body.rights.type);
  }

  const { id, lotReference } = await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'intake_updated',
    title: 'Intake updated',
    mutate: async (lot) => {
      if ((lot.__v ?? 0) !== body.version) {
        throw new HttpError(409, 'This record changed since you opened it. Reload and try again.');
      }
      if (isTerminalStage(lot.stage) && !can(ctx.grants, 'lot:editTerminal')) {
        throw new HttpError(403, 'Finished lots are locked. Your role cannot edit them.');
      }
      if (body.quantityToDigitize !== undefined && body.quantityToDigitize > lot.quantity) {
        throw new HttpError(400, 'Quantity to digitize cannot exceed quantity.');
      }

      const prevFormat = lot.format;
      const prevSubtype = lot.mediaSubtype;
      const prevOrigin = lot.originSource;
      const prevDataType = lot.dataType;
      const prevRightsType = lot.rights?.type ?? null;

      if (body.dateReceived !== undefined) lot.dateReceived = new Date(body.dateReceived);
      if (body.originSource !== undefined) lot.originSource = body.originSource;
      if (body.format !== undefined) lot.format = body.format;
      if (body.dataType !== undefined) lot.dataType = body.dataType;
      if (body.notDigitizedReason !== undefined) {
        // Items that remain unselected inherit the new reason.
        await LotItem.updateMany(
          { lot: lot._id, selectedForDigitization: false },
          { $set: { notDigitizedReason: body.notDigitizedReason ?? null } },
          { session: lot.$session() ?? undefined },
        );
      }
      if (body.owner !== undefined) lot.owner = body.owner as typeof lot.owner;
      if (body.pointsOfContact !== undefined) lot.pointsOfContact = body.pointsOfContact as typeof lot.pointsOfContact;
      if (body.referencePeople !== undefined) lot.referencePeople = body.referencePeople as typeof lot.referencePeople;
      if (body.facilitator !== undefined) lot.facilitator = (body.facilitator ?? null) as typeof lot.facilitator;
      if (body.mediaSubtype !== undefined) lot.mediaSubtype = body.mediaSubtype;
      if (body.quantityToDigitize !== undefined) {
        lot.quantityToDigitize = body.quantityToDigitize;
        lot.set('digitization.expectedFileCount', body.quantityToDigitize);
      }
      const clearable: (keyof LotPatchBody)[] = [
        'quantityRemarks',
        'conditionNotes',
        'reasonForSending',
        'senderRemarks',
        'photoDate',
        'photoLocation',
        'photoEvent',
        'peopleInPhoto',
        'digitalFilePath',
      ];
      for (const field of clearable) {
        if (body[field] !== undefined) {
          (lot as unknown as Record<string, unknown>)[field] = body[field] ?? null;
        }
      }
      if (body.physicalLabelApplied !== undefined) lot.physicalLabelApplied = body.physicalLabelApplied;
      if (body.containerLabelApplied !== undefined) lot.containerLabelApplied = body.containerLabelApplied;
      if (body.conditionPhotoUrl !== undefined) lot.conditionPhotoUrl = body.conditionPhotoUrl;
      if (body.rights !== undefined) {
        if (body.rights === null) {
          lot.rights = { type: null, deedReference: null, notes: null };
        } else {
          lot.rights = {
            type: body.rights.type ?? lot.rights?.type ?? null,
            deedReference: body.rights.deedReference ?? lot.rights?.deedReference ?? null,
            notes: body.rights.notes ?? lot.rights?.notes ?? null,
          };
        }
      }

      const session = lot.$session() ?? undefined;
      if (body.mediaSubtype !== undefined) {
        const key = await mediaSubtypeListKeyAsync(prevFormat);
        if (key) await transferUsage(key, prevSubtype, body.mediaSubtype, session);
        const newKey = await mediaSubtypeListKeyAsync(lot.format);
        if (newKey && newKey !== key) await bumpUsage(newKey, body.mediaSubtype, session);
      }
      if (body.originSource !== undefined) {
        await transferUsage('originSource', prevOrigin, body.originSource, session);
      }
      if (body.format !== undefined) await transferUsage('format', prevFormat, body.format, session);
      if (body.dataType !== undefined) {
        await transferUsage('dataType', prevDataType, body.dataType, session);
      }
      if (body.notDigitizedReason) {
        await bumpUsage('notDigitizedReason', body.notDigitizedReason, session);
      }
      if (body.rights?.type) {
        await transferUsage('rightsType', prevRightsType, body.rights.type, session);
      }

      return { id: String(lot._id), lotReference: lot.lotReference };
    },
  });

  // Shared intake fields on a project child lot: push to the project and every sibling.
  const sharedKeys = LOT_PATCH_SHARED_KEYS.filter((k) => (body as Record<string, unknown>)[k] !== undefined);
  if (sharedKeys.length > 0) await propagateFromLot(id, sharedKeys, ctx);

  const fresh = await ArchiveLot.findById(id).select('__v').lean();
  return { id, lotReference, version: fresh?.__v ?? 0 };
}

/** Moves an intake lot into the decision queue. Route permission: `lot:edit`. */
export async function submitForDecision(
  lotId: string,
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; stage: 'decision'; version: number }> {
  const { id, lotReference } = await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'submitted_for_decision',
    title: 'Submitted for decision',
    mutate: async (lot) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      if (lot.stage !== 'intake') {
        throw new HttpError(400, 'Only intake lots can be submitted for decision.');
      }
      const missing = intakeMissing(lot);
      if (missing.length > 0) {
        throw new HttpError(
          400,
          `Fill in ${missing.join(', ')} before sending this lot to decision.`,
        );
      }
      if (lot.decision.status !== 'pending') {
        throw new HttpError(409, 'This lot already has a recorded decision.');
      }
      lot.stage = 'decision';
      return { id: String(lot._id), lotReference: lot.lotReference };
    },
  });

  const fresh = await ArchiveLot.findById(id).select('__v').lean();
  return { id, lotReference, stage: 'decision' as const, version: fresh?.__v ?? 0 };
}

/**
 * Naming-code prefix: the Tier-2 vocabulary item's `codePrefix` when the
 * format has a managed list, else the format fallback (documents/prasadi are
 * free text per SPEC Q2, so there is no item to read).
 */
export async function namingPrefix(format: string, mediaSubtype: string): Promise<string> {
  const key = await mediaSubtypeListKeyAsync(format);
  if (key) {
    const list = await getReferenceList(key);
    const prefix = list.find((i) => i.value === mediaSubtype)?.meta?.codePrefix;
    if (typeof prefix === 'string' && prefix.length > 0) return prefix;
  }
  return FORMAT_DEFAULT_PREFIX[format] ?? 'GEN';
}

/**
 * Shared decision-write core (API.md §4). Both the checklist route and the
 * triage bulk route answer the same lot facts (`DecisionFacts`) and run through
 * here, so the verdict, guards, stage transition, item recode and side effects
 * live in exactly one place. The verdict is computed here on the server, never
 * trusted from the client:
 * - verdict `archive` → status archive, stage metadata, naming code issued,
 *   items recoded to it. A `disposition` contradicts the verdict and needs an
 *   approved override (else 400 naming the verdict).
 * - verdict `return_or_discard` → `disposition` (return|discard) is required.
 * Re-recording needs an approved override, which is consumed by the write.
 * Route permission: `decision:record`.
 */
type DecisionFacts = {
  existsInMls: boolean;
  newCopyIsBetter?: boolean | undefined;
  mlsMatchPaths?: string[] | undefined;
  conditionUsable: boolean;
  conditionIssue?: string | undefined;
  significanceFlags: SignificanceFlags;
  notes?: string | undefined;
  disposition?: 'return' | 'discard' | undefined;
  discardReason?: string | undefined;
  discardNotes?: string | undefined;
  /** Archived lot with nothing to digitize (Excel item decisions): skips digitization, goes to storage. */
  keepPhysical?: boolean | undefined;
};

async function writeDecision(
  lotId: string,
  body: DecisionFacts,
  ctx: MutationContext,
  auditTitle: string,
  preWrite?: (lot: HydratedDocument<ArchiveLotDoc>, session: ClientSession) => Promise<void>,
): Promise<DecisionResponse> {
  const verdict = computeVerdict({
    existsInMls: body.existsInMls,
    newCopyIsBetter: body.newCopyIsBetter,
    conditionUsable: body.conditionUsable,
    significanceFlags: body.significanceFlags,
  });

  const outcome = await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'decision_recorded',
    title: auditTitle,
    detail: body.conditionIssue ? `Condition issue: ${body.conditionIssue}` : undefined,
    mutate: async (lot, session) => {
      if (preWrite) await preWrite(lot, session);
      const format = lot.format;
      const mediaSubtype = lot.mediaSubtype;
      const originSource = lot.originSource;
      if (lot.stage === 'intake') {
        const missing = intakeMissing(lot);
        if (missing.length > 0) {
          throw new HttpError(400, `Fill in ${missing.join(', ')} before recording a decision.`);
        }
      }
      if (!lot.decision || !mediaSubtype || !originSource) {
        throw new HttpError(500, 'Lot is missing required fields.');
      }
      const decided = lot.decision.status !== 'pending';
      const consumingApproval = lot.decision.overrideStatus === 'approved';
      // An approved override reopens the decision on any unfinished stage
      // (e.g. metadata after an archive verdict). Finished lots stay locked.
      const stageOpen =
        lot.stage === 'intake' ||
        lot.stage === 'decision' ||
        (consumingApproval && !isTerminalStage(lot.stage));
      if (!stageOpen) {
        throw new HttpError(400, 'Decisions can only be recorded on unfinished lots.');
      }
      if (decided && !consumingApproval) {
        throw new HttpError(
          409,
          'A decision is already recorded. Request an override to revisit it.',
        );
      }

      let status: 'archive' | 'return' | 'discard';
      let stage: Stage;
      let namingCode: string | null = lot.namingCode ?? null;
      if (verdict === 'archive') {
        if (body.disposition && !consumingApproval) {
          throw new HttpError(
            400,
            'The server verdict is archive — recording return or discard needs an approved override.',
          );
        }
        if (body.disposition) {
          status = body.disposition;
          stage = body.disposition === 'return' ? 'returned' : 'discarded';
        } else {
          status = 'archive';
          stage = body.keepPhysical ? 'storage' : 'metadata';
          namingCode = await generateNamingCode(
            await namingPrefix(format, mediaSubtype),
            originSource,
            session,
          );
          lot.namingCode = namingCode;
          // Items keep their own codes (issued at creation); the naming code names the lot.
        }
      } else {
        if (!body.disposition) {
          throw new HttpError(
            400,
            'A disposition (return or discard) is required — the server verdict is return_or_discard.',
          );
        }
        status = body.disposition;
        stage = body.disposition === 'return' ? 'returned' : 'discarded';
      }

      if (consumingApproval) lot.decision.overrideStatus = 'none';
      lot.decision.status = status;
      lot.decision.verdict = verdict;
      lot.decision.decidedBy = new Types.ObjectId(ctx.userId);
      lot.decision.decidedAt = new Date();
      lot.decision.existsInMls = body.existsInMls;
      lot.decision.mlsMatchPaths = body.mlsMatchPaths ?? [];
      lot.decision.conditionUsable = body.conditionUsable;
      lot.decision.newCopyIsBetter =
        body.newCopyIsBetter === undefined ? null : body.newCopyIsBetter;
      lot.decision.conditionIssue = body.conditionIssue ?? null;
      lot.set('decision.significanceFlags', [...body.significanceFlags]);
      lot.set('decision.significanceNotes', body.notes ?? null);
      // Brief side-effects: a return disposition opens the return tracker; a
      // discard disposition records the reason the checklist chose.
      if (status === 'return') {
        lot.set('return.requested', true);
        if (lot.return?.status === 'not_requested' || !lot.return?.status) {
          lot.set('return.status', 'pending');
        }
      }
      if (status === 'discard') {
        const reason = body.discardReason ?? 'other';
        lot.set('discard.reason', reason);
        lot.set('discard.notes', body.discardNotes ?? null);
        lot.set('discard.discardedBy', new Types.ObjectId(ctx.userId));
        lot.set('discard.discardedAt', new Date());
        await bumpUsage('discardReason', reason, session);
      }
      lot.stage = stage;

      return {
        id: String(lot._id),
        lotReference: lot.lotReference,
        namingCode,
        verdict,
        decision: status,
        stage,
      };
    },
  });

  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return { ...outcome, version: fresh?.__v ?? 0 };
}

/**
 * Significance answers are positional — one boolean per active `significance`
 * question, in list order. The admin can reword, add, or retire questions, so
 * every write checks the answers still line up with the current list instead
 * of silently recording against shifted positions.
 */
async function significanceQuestionCount(): Promise<number> {
  const questions = await getActiveReferenceItems('significance');
  if (questions.length === 0) {
    throw new HttpError(500, 'No significance questions configured.');
  }
  return questions.length;
}

async function assertFlagsMatchQuestions(flags: readonly boolean[]): Promise<void> {
  const questionCount = await significanceQuestionCount();
  if (flags.length !== questionCount) {
    throw new HttpError(
      400,
      'The significance questions changed — re-answer them and record again.',
    );
  }
}

/** Checklist entry point — asserts vocabulary, builds the audit title, delegates. */
export async function recordDecision(
  lotId: string,
  body: DecisionBody,
  ctx: MutationContext,
): Promise<DecisionResponse> {
  if (body.discardReason) {
    await assertActive('discardReason', body.discardReason);
  }
  await assertFlagsMatchQuestions(body.significanceFlags);
  const verdict = computeVerdict({
    existsInMls: body.existsInMls,
    newCopyIsBetter: body.newCopyIsBetter,
    conditionUsable: body.conditionUsable,
    significanceFlags: body.significanceFlags,
  });
  const title =
    verdict === 'archive' && !body.disposition
      ? 'Decision recorded — archive'
      : `Decision recorded — ${body.disposition ?? 'archive'}`;
  return writeDecision(lotId, body, ctx, title);
}

/**
 * Triage bulk entry point. Every item id must belong to the lot; every dropped
 * item needs an active `notDigitizedReason`. Per-group significance flags are
 * OR-ed into one lot-level tuple, then the shared core records the decision —
 * selections land in the same transaction, and `expectedFileCount` is
 * recounted from the kept items so the digitize queue stays truthful.
 */
export async function recordTriageDecision(
  lotId: string,
  body: TriageBulkBody,
  ctx: MutationContext,
): Promise<DecisionResponse> {
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const lotObjectId = new Types.ObjectId(lotId);
  const ids = body.items.map((it) => it.id);
  if (ids.some((id) => !Types.ObjectId.isValid(id))) {
    throw new HttpError(404, 'Some items do not belong to this lot.');
  }
  const matchCount = await LotItem.countDocuments({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    lot: lotObjectId,
  });
  if (matchCount !== ids.length) {
    throw new HttpError(404, 'Some items do not belong to this lot.');
  }
  if (body.discardReason) {
    await assertActive('discardReason', body.discardReason);
  }
  const reasons = [...new Set(body.items.filter((it) => !it.selected).map((it) => it.reason))];
  await Promise.all(
    reasons.map((r) => assertActiveReferenceValue('notDigitizedReason', r ?? '')),
  );
  const questionCount = await significanceQuestionCount();
  if (body.groupFlags.some((g) => g.flags.length !== questionCount)) {
    throw new HttpError(
      400,
      'The significance questions changed — re-answer them and record again.',
    );
  }
  const significanceFlags = unionSignificanceFlags(
    body.groupFlags.map((g) => g.flags),
    questionCount,
  );
  const verdict = computeVerdict({
    existsInMls: body.existsInMls,
    newCopyIsBetter: body.newCopyIsBetter,
    conditionUsable: body.conditionUsable,
    significanceFlags,
  });
  const title =
    verdict === 'archive' && !body.disposition
      ? 'Decision recorded (triage) — archive'
      : `Decision recorded (triage) — ${body.disposition ?? 'archive'}`;

  return writeDecision(
    lotId,
    {
      existsInMls: body.existsInMls,
      newCopyIsBetter: body.newCopyIsBetter,
      mlsMatchPaths: body.mlsMatchPaths,
      conditionUsable: body.conditionUsable,
      conditionIssue: body.conditionIssue,
      significanceFlags,
      notes: body.notes,
      disposition: body.disposition,
      discardReason: body.discardReason,
      discardNotes: body.discardNotes,
    },
    ctx,
    title,
    async (lot, session) => {
      for (let i = 0; i < body.items.length; i += 1000) {
        await LotItem.bulkWrite(
          body.items.slice(i, i + 1000).map((it) => ({
            updateOne: {
              filter: { _id: new Types.ObjectId(it.id), lot: lot._id },
              update: {
                $set: {
                  selectedForDigitization: it.selected,
                  notDigitizedReason: it.selected ? null : it.reason,
                },
              },
            },
          })),
          { session },
        );
      }
      const selectedCount = await LotItem.countDocuments({
        lot: lot._id,
        selectedForDigitization: true,
      }).session(session);
      lot.set('digitization.expectedFileCount', selectedCount);
    },
  );
}

/**
 * Items-grid entry point: every item of the lot has its own final result
 * (archive / return / discard), so the LOT decision follows from them —
 * "split by item":
 * - any archived item → lot verdict archive: stage metadata, naming code issued,
 *   only archived items stay selected; the return/discard items are queued item by
 *   item (`dispositionStatus: 'pending'`) in the Returns / Discards queues.
 * - no archived item → lot-level return (any item to return) or discard; the
 *   existing lot return/discard flow handles it.
 * Runs through the shared `writeDecision` core so guards, gate, recode and side
 * effects stay in one place. Called by the grid save, never directly by a route.
 */
export async function finalizeItemDecisions(lotId: string, ctx: MutationContext): Promise<DecisionResponse> {
  const lotObjectId = new Types.ObjectId(lotId);
  const [digitize, discard, physical, total] = await Promise.all([
    LotItem.countDocuments({
      lot: lotObjectId,
      $or: [{ 'decision.digital': true }, { 'decision.redigital': true }],
      'decision.discard': { $in: [true, false] },
      'decision.digital': { $in: [true, false] },
      'decision.redigital': { $in: [true, false] },
    }),
    LotItem.countDocuments({
      lot: lotObjectId,
      'decision.digital': false,
      'decision.redigital': false,
      'decision.discard': true,
    }),
    LotItem.countDocuments({
      lot: lotObjectId,
      'decision.digital': false,
      'decision.redigital': false,
      'decision.discard': false,
    }),
    LotItem.countDocuments({ lot: lotObjectId }),
  ]);
  if (digitize + discard + physical !== total) {
    throw new HttpError(400, 'Every item needs a decision before the lot can move on.');
  }
  const questionCount = await significanceQuestionCount();
  const significanceFlags = Array.from({ length: questionCount }, (_, i) => i === 0);
  const summary = `Decided item by item: ${digitize} to digitize, ${discard} to discard, ${physical} kept physical only.`;
  // The lot is "archived" whenever it is kept at all. With nothing to digitize it goes
  // straight to storage; otherwise on to digitization. Items carry their own fate
  // (discard / return) in the item queues, so the lot never takes a lot-level return or discard.
  return writeDecision(
    lotId,
    {
      existsInMls: false,
      conditionUsable: true,
      significanceFlags,
      notes: summary,
      keepPhysical: digitize === 0,
    },
    ctx,
    `Decision recorded (items) — ${digitize > 0 ? 'archive' : 'physical only'}`,
    async (lot, session) => {
      lot.set('digitization.expectedFileCount', digitize);
      // Denormalised for the item return / discard queues (no $lookup on read).
      await LotItem.updateMany({ lot: lot._id }, { $set: { lotReference: lot.lotReference } }, { session });
    },
  );
}

/**
 * Opens an override on a recorded decision. The justification is stored on the
 * audit entry (the schema has no justification field — history must not be
 * rewritten). Route permission: `override:request`.
 */
export async function requestOverride(
  lotId: string,
  body: OverrideRequestBody,
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; overrideStatus: 'requested'; version: number }> {
  const { id, lotReference } = await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'override_requested',
    title: 'Override requested',
    detail: body.justification,
    mutate: async (lot) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      if (lot.decision.status === 'pending') {
        throw new HttpError(400, 'There is no recorded decision to override yet.');
      }
      if (lot.decision.overrideStatus === 'requested') {
        throw new HttpError(409, 'An override request is already open on this lot.');
      }
      if (lot.decision.overrideStatus === 'approved') {
        throw new HttpError(409, 'An approved override is already open — record the new decision first.');
      }
      lot.decision.overrideStatus = 'requested';
      lot.decision.overrideRequestedBy = new Types.ObjectId(ctx.userId);
      return { id: String(lot._id), lotReference: lot.lotReference };
    },
  });

  const fresh = await ArchiveLot.findById(id).select('__v').lean();
  return { id, lotReference, overrideStatus: 'requested' as const, version: fresh?.__v ?? 0 };
}

/**
 * Approves or rejects an open override request. An approval lets the reviewer
 * re-record the decision against the server verdict (consumed on write).
 * Route permission: `override:approve`.
 */
export async function decideOverride(
  lotId: string,
  body: OverrideDecideBody,
  ctx: MutationContext,
): Promise<{
  id: string;
  lotReference: string;
  overrideStatus: 'approved' | 'rejected';
  version: number;
}> {
  const { id, lotReference, overrideStatus } = await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: body.outcome === 'approved' ? 'override_approved' : 'override_rejected',
    title: body.outcome === 'approved' ? 'Override approved' : 'Override rejected',
    mutate: async (lot) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      if (lot.decision.overrideStatus !== 'requested') {
        throw new HttpError(409, 'There is no open override request on this lot.');
      }
      // Rejecting is always safe; approving on a finished lot would create an
      // approval that can never be consumed (re-decision stays locked there).
      if (body.outcome === 'approved' && isTerminalStage(lot.stage)) {
        throw new HttpError(400, 'Finished lots are locked — the decision cannot be revisited.');
      }
      lot.decision.overrideStatus = body.outcome;
      lot.decision.overrideApprovedBy = new Types.ObjectId(ctx.userId);
      return {
        id: String(lot._id),
        lotReference: lot.lotReference,
        overrideStatus: body.outcome,
      };
    },
  });

  const fresh = await ArchiveLot.findById(id).select('__v').lean();
  return { id, lotReference, overrideStatus, version: fresh?.__v ?? 0 };
}
