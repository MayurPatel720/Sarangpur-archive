import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import type { MutationContext } from '@/lib/api';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { ActivityLog } from '@/models/ActivityLog';
import { can } from '@/server/permissions';
import { withAudit } from '@/server/audit';
import { assertActiveReferenceValue, getReferenceList, bumpUsage, transferUsage } from '@/server/reference';
import { mediaSubtypeListKeyAsync } from '@/server/lots/queries';
import { assertActive } from '@/server/reference/runtime';
import { computeVerdict, type Verdict } from '@/server/lots/decision-rule';
import { generateItemCodes, generateLotReference, generateNamingCode, FORMAT_DEFAULT_PREFIX } from '@/server/codes';
import { isTerminalStage } from '@/server/lots/queries';
import type { Stage } from '@/lib/domain';
import type { LotCreateBody, LotPatchBody, DecisionBody, DecisionResponse, OverrideRequestBody, OverrideDecideBody } from '@/types/lot';

async function subtypeLabel(format: string, value: string): Promise<string> {
  const key = await mediaSubtypeListKeyAsync(format);
  if (!key) return value;
  const items = await getReferenceList(key);
  return items.find((i) => i.value === value)?.label ?? value;
}

/**
 * Creates an intake in ONE transaction (SPEC §4.4): allocates the lotReference,
 * inserts the lot, bulk-inserts `quantity` LotItems (first `quantityToDigitize`
 * selected), bumps vocabulary usage, writes the `intake_created` audit entry.
 */
export async function createIntake(
  body: LotCreateBody,
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; itemsCreated: number }> {
  // Admin-managed vocabulary — reject retired/unknown values before the transaction.
  await Promise.all([
    assertActiveReferenceValue('originSource', body.originSource),
    assertActiveReferenceValue('format', body.format),
    assertActiveReferenceValue('dataType', body.dataType),
    body.returnFormat ? assertActiveReferenceValue('returnFormat', body.returnFormat) : Promise.resolve(),
    body.notDigitizedReason
      ? assertActiveReferenceValue('notDigitizedReason', body.notDigitizedReason)
      : Promise.resolve(),
    body.rights?.type ? assertActiveReferenceValue('rightsType', body.rights.type) : Promise.resolve(),
  ]);
  const subtypeKey = await mediaSubtypeListKeyAsync(body.format);
  if (subtypeKey) {
    await assertActiveReferenceValue(subtypeKey, body.mediaSubtype);
  }

  await connectToDatabase();
  const session = await ArchiveLot.startSession();
  try {
    let lotId = '';
    let lotReference = '';
    await session.withTransaction(async () => {
      lotReference = await generateLotReference(session);

      const [lot] = await ArchiveLot.create(
        [
          {
            lotReference,
            originSource: body.originSource,
            dateReceived: new Date(body.dateReceived),
            receiver: new Types.ObjectId(ctx.userId),
            owner: body.owner,
            pointsOfContact: body.pointsOfContact ?? [],
            facilitator: body.facilitator ?? null,
            format: body.format,
            dataType: body.dataType,
            mediaSubtype: body.mediaSubtype,
            quantity: body.quantity,
            quantityToDigitize: body.quantityToDigitize ?? 0,
            quantityAlreadyDigitized: body.quantityAlreadyDigitized ?? 0,
            quantityRemarks: body.quantityRemarks,
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
              dueAt: null,
              status: body.returnRequested ? 'pending' : 'not_requested',
              returnedAt: null,
              method: null,
              handledBy: null,
              trackingReference: null,
              notes: null,
            },
            stage: 'intake',
            stageEnteredAt: new Date(),
          },
        ],
        { session },
      );
      lot!.set('digitization.expectedFileCount', body.quantityToDigitize ?? 0);
      await lot!.save({ session });
      lotId = String(lot!._id);

      const codes = generateItemCodes(lotReference, body.quantity);
      const docs = codes.map((c, idx) => ({
        lot: lot!._id,
        code: c.code,
        groupNo: c.groupNo,
        itemNo: c.itemNo,
        selectedForDigitization: idx < (body.quantityToDigitize ?? 0),
        notDigitizedReason:
          idx < (body.quantityToDigitize ?? 0) ? null : (body.notDigitizedReason ?? null),
      }));
      for (let i = 0; i < docs.length; i += 2000) {
        await LotItem.insertMany(docs.slice(i, i + 2000), { session });
      }

      // usageCount for open-list values the lot will never change again.
      if (subtypeKey) await bumpUsage(subtypeKey, body.mediaSubtype, session);
      if (body.rights?.type) await bumpUsage('rightsType', body.rights.type, session);
      await bumpUsage('originSource', body.originSource, session);
      await bumpUsage('format', body.format, session);
      await bumpUsage('dataType', body.dataType, session);
      if (body.returnFormat) await bumpUsage('returnFormat', body.returnFormat, session);
      if (body.notDigitizedReason) {
        await bumpUsage('notDigitizedReason', body.notDigitizedReason, session);
      }

      const label = await subtypeLabel(body.format, body.mediaSubtype);
      await ActivityLog.create(
        [
          {
            lot: lot!._id,
            lotCode: lotReference,
            kind: 'intake_created',
            title: 'Intake created',
            detail: `${body.quantity} items · ${label}. Condition photo attached.`,
            actor: new Types.ObjectId(ctx.userId),
            actorName: ctx.userName,
            at: new Date(),
            changes: [],
          },
        ],
        { session },
      );
    });
    return { id: lotId, lotReference, itemsCreated: body.quantity };
  } finally {
    await session.endSession();
  }
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
    actor: { id: ctx.userId, name: ctx.userName },
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
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'submitted_for_decision',
    title: 'Submitted for decision',
    mutate: async (lot) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      if (lot.stage !== 'intake') {
        throw new HttpError(400, 'Only intake lots can be submitted for decision.');
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
async function namingPrefix(format: string, mediaSubtype: string): Promise<string> {
  const key = await mediaSubtypeListKeyAsync(format);
  if (key) {
    const list = await getReferenceList(key);
    const prefix = list.find((i) => i.value === mediaSubtype)?.meta?.codePrefix;
    if (typeof prefix === 'string' && prefix.length > 0) return prefix;
  }
  return FORMAT_DEFAULT_PREFIX[format] ?? 'GEN';
}

/**
 * Records the decision checklist (API.md §4). The verdict is computed here on
 * the server, never trusted from the client:
 * - verdict `archive` → status archive, stage metadata, naming code issued,
 *   items recoded to it. A `disposition` contradicts the verdict and needs an
 *   approved override (else 400 naming the verdict).
 * - verdict `return_or_discard` → `disposition` (return|discard) is required.
 * Re-recording needs an approved override, which is consumed by the write.
 * Route permission: `decision:record`.
 */
export async function recordDecision(
  lotId: string,
  body: DecisionBody,
  ctx: MutationContext,
): Promise<DecisionResponse> {
  if (body.discardReason) {
    await assertActive('discardReason', body.discardReason);
  }
  const verdict = computeVerdict({
    existsInMls: body.existsInMls,
    newCopyIsBetter: body.newCopyIsBetter,
    conditionUsable: body.conditionUsable,
    significanceFlags: body.significanceFlags,
  });

  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'decision_recorded',
    title:
      verdict === 'archive' && !body.disposition
        ? 'Decision recorded — archive'
        : `Decision recorded — ${body.disposition ?? 'archive'}`,
    detail: body.conditionIssue ? `Condition issue: ${body.conditionIssue}` : undefined,
    mutate: async (lot, session) => {
      const format = lot.format;
      const mediaSubtype = lot.mediaSubtype;
      const originSource = lot.originSource;
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
          stage = 'metadata';
          namingCode = await generateNamingCode(
            await namingPrefix(format, mediaSubtype),
            originSource,
            session,
          );
          lot.namingCode = namingCode;
          // Recode every item to the naming code (SPEC §4.3), chunked.
          const codes = generateItemCodes(namingCode, lot.quantity);
          for (let i = 0; i < codes.length; i += 1000) {
            await LotItem.bulkWrite(
              codes.slice(i, i + 1000).map((c) => ({
                updateOne: {
                  filter: { lot: lot._id, groupNo: c.groupNo, itemNo: c.itemNo },
                  update: { $set: { code: c.code } },
                },
              })),
              { session },
            );
          }
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
    actor: { id: ctx.userId, name: ctx.userName },
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
    actor: { id: ctx.userId, name: ctx.userName },
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
