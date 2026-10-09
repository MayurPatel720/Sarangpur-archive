import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { HttpError, type MutationContext } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { auditActor, withAudit } from '@/server/audit';
import { finishLotIfHandled, type ReturnHandover } from '@/server/lots/item-grid';
import { bumpUsage } from '@/server/reference';
import { assertActive, activeValuesWithFlag } from '@/server/reference/runtime';
import type { ReturnRecordBody, ReturnRecordResponse } from '@/types/returns';

/**
 * Record a handover: WHO received the material, how, and when. Two scopes:
 *  - `lot`   — the whole lot goes back (lot-level return must be open);
 *  - `items` — chosen pending item returns from a lot; when that leaves nothing else to
 *    digitize or hand over, the lot itself becomes Returned.
 * Material that still has to be digitalized cannot go back yet.
 */

const clean = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

export async function recordReturn(body: ReturnRecordBody, ctx: MutationContext): Promise<ReturnRecordResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(body.lotId)) throw new HttpError(404, 'Lot not found.');
  const method = clean(body.method);
  if (method) await assertActive('returnMethod', method);

  const handover: ReturnHandover = {
    recipient: {
      name: body.recipient.name.trim(),
      email: clean(body.recipient.email),
      phone: clean(body.recipient.phone),
      place: clean(body.recipient.place),
    },
    method,
    trackingReference: clean(body.trackingReference),
    notes: clean(body.notes),
    returnedAt: body.returnedOn ? new Date(`${body.returnedOn}T12:00:00`) : new Date(),
  };
  const lotObjectId = new Types.ObjectId(body.lotId);
  const lotRef = (await ArchiveLot.findById(lotObjectId).select('lotReference').lean())?.lotReference;
  if (!lotRef) throw new HttpError(404, 'Lot not found.');
  const where = `${handover.recipient.name}${handover.recipient.place ? ` · ${handover.recipient.place}` : ''}${method ? ` · ${method}` : ''}`;

  const waitingFilter = {
    lot: lotObjectId,
    $or: [{ 'decision.digital': true }, { 'decision.redigital': true }],
    digitized: { $ne: true },
  };

  if (body.scope === 'lot') {
    const open = await activeValuesWithFlag('returnStatus', 'open');
    const openStatuses = open.length > 0 ? open : ['pending', 'in_progress'];
    await withAudit({
      lotId: body.lotId,
      actor: auditActor(ctx),
      kind: 'return_completed',
      title: 'Return completed',
      detail: `Handed to ${where}`,
      mutate: async (lot, session) => {
        if (!openStatuses.includes(lot.return?.status ?? '')) {
          throw new HttpError(409, 'This lot is not waiting to be returned (it may already be handed over).');
        }
        const waiting = await LotItem.countDocuments(waitingFilter).session(session);
        if (waiting > 0) {
          throw new HttpError(400, `${waiting} ${waiting === 1 ? 'item' : 'items'} must be digitalized before the originals go back.`);
        }
        lot.set('return.status', 'returned');
        lot.set('return.returnedAt', handover.returnedAt);
        lot.set('return.recipient', handover.recipient);
        lot.set('return.method', handover.method ?? undefined);
        lot.set('return.trackingReference', handover.trackingReference ?? undefined);
        lot.set('return.notes', handover.notes ?? undefined);
        lot.set('return.handledBy', new Types.ObjectId(ctx.userId));
        lot.stage = 'returned';
        if (handover.method) await bumpUsage('returnMethod', handover.method, session ?? undefined);
        return null;
      },
    });
    return { lotReference: lotRef, returned: 1, lotFinished: true };
  }

  const ids = [...new Set(body.itemIds ?? [])].map((id) => new Types.ObjectId(id));
  const items = await LotItem.find({
    _id: { $in: ids },
    lot: lotObjectId,
    'decision.disposition': 'return',
    dispositionStatus: 'pending',
  })
    .select('code digitized decision')
    .lean();
  if (items.length !== ids.length) {
    throw new HttpError(409, 'Some of those items are no longer waiting to be returned. Refresh and try again.');
  }
  const waiting = items.filter((it) => {
    const d = (it.decision ?? {}) as { digital?: boolean | null; redigital?: boolean | null };
    return (d.digital === true || d.redigital === true) && !it.digitized;
  });
  if (waiting.length > 0) {
    throw new HttpError(
      400,
      `${waiting.length === 1 ? waiting[0]!.code : `${waiting.length} items`} must be digitalized before the physical copy goes back.`,
    );
  }

  const batchId = randomUUID();
  await withAudit({
    lotId: body.lotId,
    actor: auditActor(ctx),
    kind: 'return_completed',
    title: `${ids.length} ${ids.length === 1 ? 'item' : 'items'} returned`,
    detail: `Handed to ${where}`,
    mutate: async (_lot, session) => {
      await LotItem.updateMany(
        { _id: { $in: ids }, dispositionStatus: 'pending' },
        {
          $set: {
            dispositionStatus: 'done',
            dispositionDoneAt: handover.returnedAt,
            dispositionDoneByName: ctx.userName,
            returnInfo: {
              batchId,
              recipientName: handover.recipient.name,
              recipientEmail: handover.recipient.email,
              recipientPhone: handover.recipient.phone,
              recipientPlace: handover.recipient.place,
              method: handover.method,
              trackingReference: handover.trackingReference,
              notes: handover.notes,
            },
          },
        },
        { session },
      );
      if (handover.method) await bumpUsage('returnMethod', handover.method, session ?? undefined);
      return null;
    },
  });
  const lotFinished = await finishLotIfHandled(body.lotId, ctx, handover);
  return { lotReference: lotRef, returned: ids.length, lotFinished };
}
