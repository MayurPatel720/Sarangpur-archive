import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import type { MutationContext } from '@/lib/api';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { FileIndex } from '@/models/FileIndex';
import { MlsOutbox } from '@/models/MlsOutbox';
import { can } from '@/server/permissions';
import { withAudit } from '@/server/audit';
import { getStageGraph } from '@/server/reference/runtime';
import { diffReconciliation } from '@/server/reconcile/diff';
import { isTerminalStage } from '@/server/lots/queries';
import { assertActive } from '@/server/reference/runtime';
import { bumpUsage } from '@/server/reference';
import type {
  ScanBody,
  MlsBody,
  DuplicateBody,
  ReturnBody,
  DiscardBody,
} from '@/types/ops';

/** Terminal lots are a locked legal record — operations need `lot:editTerminal`. */
function guardTerminal(lot: { stage: string }, ctx: MutationContext): void {
  if (isTerminalStage(lot.stage) && !can(ctx.grants, 'lot:editTerminal')) {
    throw new HttpError(403, 'Finished lots are locked. Your role cannot edit them.');
  }
}

function guardVersion(lot: { __v?: number }, version: number): void {
  if ((lot.__v ?? 0) !== version) {
    throw new HttpError(409, 'This record changed since you opened it. Reload and try again.');
  }
}

/**
 * PATCH scan — records who scanned a metadata lot and where the files live.
 * First scan advances metadata → scanning (the digitize queue reads that stage).
 */
export async function recordScan(lotId: string, body: ScanBody, ctx: MutationContext) {
  await assertActive('scanStatus', body.scanStatus);
  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: body.folderPath ? 'folder_path_recorded' : 'scan_started',
    title: body.folderPath ? 'Folder path recorded' : 'Scan recorded',
    mutate: async (lot, session) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      guardVersion(lot, body.version);
      guardTerminal(lot, ctx);
      if (lot.stage !== 'metadata' && lot.stage !== 'scanning') {
        throw new HttpError(400, 'Only metadata lots can be scanned. Decide the intake first.');
      }
      lot.set('digitization.scanStatus', body.scanStatus);
      lot.set('digitization.scannedBy', new Types.ObjectId(ctx.userId));
      lot.set('digitization.scanDate', body.scanDate ? new Date(body.scanDate) : new Date());
      if (body.folderPath !== undefined) lot.set('digitization.folderPath', body.folderPath);
      if (lot.stage === 'metadata') lot.stage = 'scanning';
      await bumpUsage('scanStatus', body.scanStatus, session ?? undefined);
      return {
        id: String(lot._id),
        lotReference: lot.lotReference,
        stage: lot.stage,
        scanStatus: lot.digitization?.scanStatus ?? 'pending',
      };
    },
  });
  await connectToDatabase();
  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return { ...outcome, version: fresh?.__v ?? 0 };
}

/**
 * POST reconcile — diffs selected items against the FileIndex (the walker fills
 * it; no job queue yet, so this runs inline and returns 200 — never a fake 202).
 * Success (found ≥ expected) advances scanning → mls_tag.
 */
export async function runReconcile(lotId: string, ctx: MutationContext) {
  await connectToDatabase();
  const lot = await ArchiveLot.findById(lotId).lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  if (lot.stage !== 'scanning' && lot.stage !== 'mls_tag' && lot.stage !== 'storage') {
    throw new HttpError(400, 'Only scanning lots can be reconciled.');
  }

  const [selected, indexed] = await Promise.all([
    LotItem.find({ lot: lot._id, selectedForDigitization: true }).select('code').lean(),
    FileIndex.find({ lot: lot._id, matchedItemCode: { $ne: null } })
      .select('matchedItemCode')
      .lean(),
  ]);
  const diff = diffReconciliation(
    selected.map((i) => i.code),
    indexed.map((f) => f.matchedItemCode as string),
  );
  const complete = diff.expected > 0 && diff.found >= diff.expected;

  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: complete ? 'scan_completed' : 'reconciliation_mismatch',
    title: complete ? 'Reconciliation complete' : 'Reconciliation mismatch',
    detail: complete
      ? `Found ${diff.found} of ${diff.expected} expected files.`
      : `Missing ${diff.missing.length}: ${diff.missing.slice(0, 50).join(', ')}${diff.missing.length > 50 ? '…' : ''}`,
    mutate: async (l, _session) => {
      guardTerminal(l, ctx);
      l.set('digitization.foundFileCount', diff.found);
      l.set('digitization.lastReconciledAt', new Date());
      l.set('digitization.scanStatus', complete ? 'scanned' : l.digitization?.scanStatus ?? 'pending');
      if (complete && l.stage === 'scanning') l.stage = 'mls_tag';
      return { stage: l.stage, scanStatus: l.digitization?.scanStatus ?? 'pending' };
    },
  });
  const fresh = await ArchiveLot.findById(lotId).select('__v').lean();
  return {
    id: String(lot._id),
    lotReference: lot.lotReference,
    stage: outcome.stage,
    scanStatus: outcome.scanStatus,
    expected: diff.expected,
    found: diff.found,
    missing: diff.missing.slice(0, 100),
    missingTotal: diff.missing.length,
    unexpectedTotal: diff.unexpected.length,
    version: fresh?.__v ?? 0,
  };
}

/**
 * PATCH mls — manual tagging v1 (Module 0 decision). Writes an MlsOutbox row in
 * the SAME transaction so the future sync job drains it untouched.
 * `markComplete` advances mls_tag → storage.
 */
export async function tagMls(lotId: string, body: MlsBody, ctx: MutationContext) {
  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'mls_tagged',
    title: 'MLS tagging recorded',
    mutate: async (lot, session) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      guardVersion(lot, body.version);
      guardTerminal(lot, ctx);
      if (lot.stage !== 'mls_tag' && lot.stage !== 'storage') {
        throw new HttpError(400, 'Only mls_tag lots can be tagged.');
      }
      if (body.recordId !== undefined) lot.set('mls.recordId', body.recordId);
      if (body.taggedCount !== undefined) lot.set('mls.taggedCount', body.taggedCount);
      if (body.tagsApplied !== undefined) lot.set('mls.tagsApplied', body.tagsApplied);
      if (body.dataListAttached !== undefined) lot.set('mls.dataListAttached', body.dataListAttached);
      if (body.markComplete && lot.stage === 'mls_tag') lot.stage = 'storage';
      await MlsOutbox.create(
        [
          {
            lot: lot._id,
            operation: 'apply_tags',
            payload: {
              recordId: body.recordId ?? lot.mls?.recordId ?? null,
              taggedCount: body.taggedCount ?? lot.mls?.taggedCount ?? 0,
            },
          },
        ],
        { session },
      );
      return {
        id: String(lot._id),
        lotReference: lot.lotReference,
        stage: lot.stage,
        taggedCount: lot.mls?.taggedCount ?? 0,
      };
    },
  });
  const pending = await MlsOutbox.countDocuments({ lot: new Types.ObjectId(outcome.id), status: 'pending' });
  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return { ...outcome, outboxPending: pending, version: fresh?.__v ?? 0 };
}

/** PATCH mls/duplicate — lead+ resolves a flagged duplicate, outbox row included. */
export async function resolveDuplicate(lotId: string, body: DuplicateBody, ctx: MutationContext) {
  await assertActive('duplicateAction', body.duplicateAction);
  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'duplicate_resolved',
    title: `Duplicate ${body.duplicateAction}`,
    mutate: async (lot, session) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      guardVersion(lot, body.version);
      guardTerminal(lot, ctx);
      if (lot.stage !== 'mls_tag' && lot.stage !== 'storage') {
        throw new HttpError(400, 'Only mls_tag lots have duplicates to resolve.');
      }
      lot.set('mls.duplicateAction', body.duplicateAction);
      lot.set('mls.duplicateApprovedBy', new Types.ObjectId(ctx.userId));
      await MlsOutbox.create(
        [
          {
            lot: lot._id,
            operation: 'resolve_duplicate',
            payload: { duplicateAction: body.duplicateAction },
          },
        ],
        { session },
      );
      await bumpUsage('duplicateAction', body.duplicateAction, session ?? undefined);
      return { id: String(lot._id), lotReference: lot.lotReference };
    },
  });
  const pending = await MlsOutbox.countDocuments({ lot: new Types.ObjectId(outcome.id), status: 'pending' });
  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return {
    ...outcome,
    duplicateAction: body.duplicateAction,
    outboxPending: pending,
    version: fresh?.__v ?? 0,
  };
}

/**
 * PATCH return — request, progress, and complete returns. `status: returned`
 * moves the lot to the returned stage; requesting on a storage lot keeps it
 * there so the returns queue (status ∈ pending, in_progress) can work it.
 */
export async function manageReturn(lotId: string, body: ReturnBody, ctx: MutationContext) {
  if (body.format) await assertActive('returnFormat', body.format);
  if (body.status) await assertActive('returnStatus', body.status);
  if (body.method) await assertActive('returnMethod', body.method);
  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: body.status === 'returned' ? 'return_completed' : 'return_recorded',
    title: body.status === 'returned' ? 'Return completed' : 'Return updated',
    mutate: async (lot, session) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      guardVersion(lot, body.version);
      guardTerminal(lot, ctx);
      if (body.requested !== undefined) lot.set('return.requested', body.requested);
      if (body.format !== undefined) lot.set('return.format', body.format);
      if (body.durationText !== undefined) lot.set('return.durationText', body.durationText);
      if (body.dueAt !== undefined) lot.set('return.dueAt', body.dueAt ? new Date(body.dueAt) : null);
      if (body.method !== undefined) lot.set('return.method', body.method);
      if (body.trackingReference !== undefined) lot.set('return.trackingReference', body.trackingReference);
      if (body.notes !== undefined) lot.set('return.notes', body.notes);
      if (body.status !== undefined) {
        lot.set('return.status', body.status);
        lot.set('return.handledBy', new Types.ObjectId(ctx.userId));
        if (body.status === 'returned') {
          lot.set('return.returnedAt', new Date());
          lot.stage = 'returned';
        }
      }
      if (body.format) await bumpUsage('returnFormat', body.format, session ?? undefined);
      if (body.status) await bumpUsage('returnStatus', body.status, session ?? undefined);
      if (body.method) await bumpUsage('returnMethod', body.method, session ?? undefined);
      return {
        id: String(lot._id),
        lotReference: lot.lotReference,
        stage: lot.stage,
        returnStatus: lot.return?.status ?? 'not_requested',
      };
    },
  });
  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return { ...outcome, version: fresh?.__v ?? 0 };
}

/** POST discard — reviewer+ confirms; the lot leaves its working stage for discarded. */
export async function confirmDiscard(lotId: string, body: DiscardBody, ctx: MutationContext) {
  await assertActive('discardReason', body.reason);
  const { discardable } = await getStageGraph();
  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'discard_confirmed',
    title: `Discard confirmed (${body.reason})`,
    mutate: async (lot, session) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      guardVersion(lot, body.version);
      guardTerminal(lot, ctx);
      if (!discardable.includes(lot.stage)) {
        throw new HttpError(400, 'Only working lots can be discarded.');
      }
      lot.set('discard.reason', body.reason);
      lot.set('discard.discardedBy', new Types.ObjectId(ctx.userId));
      lot.set('discard.discardedAt', new Date());
      if (body.notes !== undefined) lot.set('discard.notes', body.notes);
      lot.stage = 'discarded';
      await bumpUsage('discardReason', body.reason, session ?? undefined);
      return { id: String(lot._id), lotReference: lot.lotReference, stage: lot.stage };
    },
  });
  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return { ...outcome, version: fresh?.__v ?? 0 };
}

/**
 * DELETE discard — admin-only reversal. Returns the lot to metadata for
 * re-review (the previous working stage is not tracked, so metadata is the
 * honest restart point). The discard block is cleared; history stays in audit.
 */
export async function reverseDiscard(lotId: string, version: number, ctx: MutationContext) {
  const outcome = await withAudit({
    lotId,
    actor: { id: ctx.userId, name: ctx.userName },
    kind: 'discard_reversed',
    title: 'Discard reversed',
    mutate: async (lot, _session) => {
      if (!lot.decision) throw new HttpError(500, 'Lot decision block is missing.');
      guardVersion(lot, version);
      if (lot.stage !== 'discarded') {
        throw new HttpError(400, 'Only discarded lots can be reversed.');
      }
      lot.set('discard.reason', null);
      lot.set('discard.discardedBy', null);
      lot.set('discard.discardedAt', null);
      lot.stage = 'metadata';
      return { id: String(lot._id), lotReference: lot.lotReference, stage: lot.stage };
    },
  });
  const fresh = await ArchiveLot.findById(outcome.id).select('__v').lean();
  return { ...outcome, version: fresh?.__v ?? 0 };
}
