import { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import type { MutationContext } from '@/lib/api';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { ActivityLog } from '@/models/ActivityLog';
import { can } from '@/server/permissions';
import { withAudit } from '@/server/audit';
import { assertActiveReferenceValue, getActiveReferenceItems, getReferenceList, bumpUsage, transferUsage } from '@/server/reference';
import { mediaSubtypeListKeyAsync } from '@/server/lots/queries';
import { assertActive } from '@/server/reference/runtime';
import { computeVerdict, unionSignificanceFlags, type SignificanceFlags, type Verdict } from '@/server/lots/decision-rule';
import { generateItemCodes, generateLotReference, generateNamingCode, FORMAT_DEFAULT_PREFIX } from '@/server/codes';
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
 * Creates an intake in ONE transaction (SPEC §4.4): allocates the lotReference,
 * inserts the lot, bulk-inserts one LotItem per unit of quantity (each line's
 * first `quantityToDigitize` items selected, carrying that line's
 * `lineIndex`), bumps vocabulary usage, and writes one `intake_created` audit
 * entry per media line (tagged with the line's sub-type for per-media-type
 * activity grouping).
 *
 * The legacy top-level media fields are derived — primary = first line,
 * quantities = across-lines sums — so every existing pipeline keeps working.
 */
export async function createIntake(
  body: LotCreateBody,
  ctx: MutationContext,
): Promise<{ id: string; lotReference: string; itemsCreated: number }> {
  // Admin-managed vocabulary — reject retired/unknown values before the transaction.
  const lines = body.mediaLines.map((l) => ({
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
    assertActiveReferenceValue('originSource', body.originSource),
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

  const primary = lines[0]!;
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalToDigitize = lines.reduce((sum, l) => sum + l.quantityToDigitize, 0);
  const totalAlreadyDigitized = lines.reduce((sum, l) => sum + l.quantityAlreadyDigitized, 0);

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
            stage: 'intake',
            stageEnteredAt: new Date(),
          },
        ],
        { session },
      );
      lot!.set('digitization.expectedFileCount', totalToDigitize);
      await lot!.save({ session });
      lotId = String(lot!._id);

      // One contiguous code run, sliced per line so group/item numbers stay
      // unique across the lot; each line's head run is selected for digitizing.
      const codes = generateItemCodes(lotReference, totalQuantity);
      const docs: Record<string, unknown>[] = [];
      let offset = 0;
      lines.forEach((line, lineIndex) => {
        const slice = codes.slice(offset, offset + line.quantity);
        offset += line.quantity;
        slice.forEach((c, idx) => {
          const selected = idx < line.quantityToDigitize;
          docs.push({
            lot: lot!._id,
            code: c.code,
            groupNo: c.groupNo,
            itemNo: c.itemNo,
            lineIndex,
            selectedForDigitization: selected,
            notDigitizedReason: selected ? null : line.notDigitizedReason,
          });
        });
      });
      for (let i = 0; i < docs.length; i += 2000) {
        await LotItem.insertMany(docs.slice(i, i + 2000), { session });
      }

      // usageCount for open-list values the lot will never change again.
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]!;
        if (subtypeKeys[i]) await bumpUsage(subtypeKeys[i]!, line.mediaSubtype, session);
      }
      if (body.rights?.type) await bumpUsage('rightsType', body.rights.type, session);
      await bumpUsage('originSource', body.originSource, session);
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
      await ActivityLog.create(
        await Promise.all(
          lines.map(async (line, i) => ({
            lot: lot!._id,
            lotCode: lotReference,
            // Per-line format: a multi-line intake logs each line under the
            // format it actually belongs to. Write-time denormalisation.
            format: line.format,
            kind: 'intake_created',
            title: lines.length > 1 ? `Intake created — line ${i + 1}` : 'Intake created',
            detail: `${line.quantity} items · ${await subtypeLabel(line.format, line.mediaSubtype)}${lines.length > 1 ? ` (${i + 1} of ${lines.length})` : ''}. Condition photo attached.`,
            mediaSubtype: line.mediaSubtype,
            mediaLineIndex: i,
            actor: actorId,
            actorName: ctx.userName,
            at: now,
            changes: [],
          })),
        ),
        { session },
      );
    });
    return { id: lotId, lotReference, itemsCreated: totalQuantity };
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
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'decision_recorded',
    title: auditTitle,
    detail: body.conditionIssue ? `Condition issue: ${body.conditionIssue}` : undefined,
    mutate: async (lot, session) => {
      if (preWrite) await preWrite(lot, session);
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
