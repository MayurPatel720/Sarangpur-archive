import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError, type MutationContext } from '@/lib/api';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotPickup } from '@/models/LotPickup';
import type { LotPickupBody, LotPickupResponse } from '@/types/lot';

/**
 * Create / delete the caller's pickup flag for a lot assigned to them. Idempotent.
 * Deliberately NOT audited and not routed through withAudit(): this is personal
 * view state, not a lot mutation (precedent: Notification read-state).
 */
export async function setLotPickup(
  body: LotPickupBody,
  ctx: MutationContext,
): Promise<LotPickupResponse> {
  await connectToDatabase();
  const lot = await ArchiveLot.findById(body.lotId).select('assignee').lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  if (!lot.assignee || String(lot.assignee) !== ctx.userId) {
    throw new HttpError(403, 'This lot is not assigned to you.');
  }
  const user = new Types.ObjectId(ctx.userId);
  const lotId = lot._id;
  if (body.accepted) {
    await LotPickup.updateOne(
      { user, lot: lotId },
      { $setOnInsert: { user, lot: lotId, at: new Date() } },
      { upsert: true },
    );
  } else {
    await LotPickup.deleteOne({ user, lot: lotId });
  }
  return { lotId: body.lotId, accepted: body.accepted };
}
