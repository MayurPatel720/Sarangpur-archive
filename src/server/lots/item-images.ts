import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { PRASADI_FORMAT } from '@/lib/item-columns';
import { ActivityLog } from '@/models/ActivityLog';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotImage, type LotImageDoc } from '@/models/LotImage';
import { LotItem } from '@/models/LotItem';
import { canWorkLot } from '@/server/lots/access';
import { can } from '@/server/permissions';
import { dropAsset, putAsset, type ParsedUpload } from '@/server/projects/images';
import { shapeLotImage } from '@/server/lots/images';
import { ITEM_PHOTO_MAX, type ItemImage, type ItemImagesResponse } from '@/types/lot-image';

/**
 * Photos of ONE item (Prasadi): up to ${ITEM_PHOTO_MAX}, the first is the cover. Same storage and
 * ordering rules as lot photos (upload first then commit; the old asset is destroyed only after a
 * delete commits). The item keeps `imageCount` and `coverUrl` so the Excel never looks anything up;
 * they change in the same transaction as the image rows. Managing needs `lot:edit` and the assignee rule.
 */

type LotHead = { _id: Types.ObjectId; lotReference: string; format: string; assignee?: unknown; assigneeName?: string | null; syncProjectId?: unknown };
type ItemHead = { _id: Types.ObjectId; code: string; format?: string | null };

export function shapeItemImage(d: LotImageDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date }): ItemImage {
  return { ...shapeLotImage(d), isCover: Boolean(d.isCover) };
}

async function load(lotId: string, itemId: string): Promise<{ lot: LotHead; item: ItemHead }> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId) || !Types.ObjectId.isValid(itemId)) throw new HttpError(404, 'Item not found.');
  const lot = (await ArchiveLot.findById(lotId).select('lotReference format assignee assigneeName syncProjectId').lean()) as LotHead | null;
  if (!lot) throw new HttpError(404, 'Lot not found.');
  const item = (await LotItem.findOne({ _id: itemId, lot: lot._id }).select('code format').lean()) as ItemHead | null;
  if (!item) throw new HttpError(404, 'Item not found.');
  return { lot, item };
}

const canManage = (lot: LotHead, ctx: MutationContext) =>
  can(ctx.grants, 'lot:edit') && canWorkLot(lot, { id: ctx.userId, grants: ctx.grants });

function assertCanManage(lot: LotHead, item: ItemHead, ctx: MutationContext): void {
  if (!can(ctx.grants, 'lot:edit')) throw new HttpError(403, 'You need the lot:edit permission to manage photos.');
  if (!canWorkLot(lot, { id: ctx.userId, grants: ctx.grants })) {
    throw new HttpError(403, 'Only the lot’s assignee or an admin can manage its photos.');
  }
  if (item.format !== PRASADI_FORMAT) throw new HttpError(400, 'Item photos are for Prasadi items.');
}

async function log(session: ClientSession, lot: LotHead, item: ItemHead, ctx: MutationContext, kind: 'lot_image_added' | 'lot_image_deleted', title: string, detail: string) {
  await ActivityLog.create(
    [{ lot: lot._id, lotCode: lot.lotReference, format: lot.format, kind, title, detail, actor: new Types.ObjectId(ctx.userId), actorName: ctx.userName, at: new Date(), changes: [] }],
    { session },
  );
}

/** Recomputes the item's denormalised photo summary from its image rows (inside the caller's transaction). */
async function syncItem(session: ClientSession, itemId: Types.ObjectId): Promise<void> {
  const imgs = await LotImage.find({ item: itemId }).sort({ createdAt: 1 }).session(session);
  let cover = imgs.find((i) => i.isCover) ?? null;
  if (!cover && imgs[0]) {
    imgs[0].isCover = true;
    await imgs[0].save({ session });
    cover = imgs[0];
  }
  await LotItem.updateOne({ _id: itemId }, { $set: { imageCount: imgs.length, coverUrl: cover?.url ?? null } }, { session });
}

export async function listItemImages(lotId: string, itemId: string, ctx: MutationContext): Promise<ItemImagesResponse> {
  const { lot, item } = await load(lotId, itemId);
  const docs = await LotImage.find({ item: item._id }).sort({ createdAt: 1 }).lean();
  return { images: docs.map(shapeItemImage), can: { manage: canManage(lot, ctx) && item.format === PRASADI_FORMAT } };
}

export async function addItemImage(lotId: string, itemId: string, upload: ParsedUpload, ctx: MutationContext): Promise<{ image: ItemImage }> {
  const { lot, item } = await load(lotId, itemId);
  assertCanManage(lot, item, ctx);
  if ((await LotImage.countDocuments({ item: item._id })) >= ITEM_PHOTO_MAX) {
    throw new HttpError(400, `An item can have at most ${ITEM_PHOTO_MAX} photos. Delete one first.`);
  }
  const stored = await putAsset(`lots/${lotId}/items/${itemId}`, upload.file);

  const session = await LotImage.startSession();
  try {
    let created: ItemImage | null = null;
    await session.withTransaction(async () => {
      // Re-check inside the transaction: two uploads racing must not pass the cap.
      if ((await LotImage.countDocuments({ item: item._id }).session(session)) >= ITEM_PHOTO_MAX) {
        throw new HttpError(400, `An item can have at most ${ITEM_PHOTO_MAX} photos. Delete one first.`);
      }
      const [doc] = await LotImage.create(
        [{
          lot: lot._id, item: item._id, isCover: false, url: stored.url, publicId: stored.publicId, fileName: stored.fileName,
          contentType: stored.contentType, sizeBytes: stored.bytes, width: stored.width ?? upload.width, height: stored.height ?? upload.height,
          caption: upload.caption ?? '', uploadedBy: new Types.ObjectId(ctx.userId), uploadedByName: ctx.userName,
        }],
        { session },
      );
      if (!doc) throw new HttpError(500, 'Could not save the photo.');
      await syncItem(session, item._id); // the first photo becomes the cover
      await log(session, lot, item, ctx, 'lot_image_added', `Photo added to ${item.code}`, upload.caption || stored.fileName);
      created = shapeItemImage((await LotImage.findById(doc._id).session(session).lean())!);
    });
    if (!created) throw new HttpError(500, 'Could not save the photo.');
    return { image: created };
  } catch (error) {
    await dropAsset(stored.publicId);
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function setItemCover(lotId: string, itemId: string, imageId: string, ctx: MutationContext): Promise<{ image: ItemImage }> {
  const { lot, item } = await load(lotId, itemId);
  if (!Types.ObjectId.isValid(imageId)) throw new HttpError(404, 'Photo not found.');
  assertCanManage(lot, item, ctx);
  const session = await LotImage.startSession();
  try {
    let out: ItemImage | null = null;
    await session.withTransaction(async () => {
      const doc = await LotImage.findOne({ _id: imageId, item: item._id }).session(session);
      if (!doc) throw new HttpError(404, 'Photo not found.');
      await LotImage.updateMany({ item: item._id }, { $set: { isCover: false } }, { session });
      doc.isCover = true;
      await doc.save({ session });
      await syncItem(session, item._id);
      out = shapeItemImage(doc.toObject());
    });
    if (!out) throw new HttpError(404, 'Photo not found.');
    return { image: out };
  } finally {
    await session.endSession();
  }
}

export async function deleteItemImage(lotId: string, itemId: string, imageId: string, ctx: MutationContext): Promise<{ ok: true }> {
  const { lot, item } = await load(lotId, itemId);
  if (!Types.ObjectId.isValid(imageId)) throw new HttpError(404, 'Photo not found.');
  assertCanManage(lot, item, ctx);
  const session = await LotImage.startSession();
  try {
    let publicId: string | null = null;
    await session.withTransaction(async () => {
      const doc = await LotImage.findOneAndDelete({ _id: imageId, item: item._id }, { session });
      if (!doc) throw new HttpError(404, 'Photo not found.');
      publicId = doc.publicId;
      await syncItem(session, item._id); // the next oldest photo becomes the cover when the cover was deleted
      await log(session, lot, item, ctx, 'lot_image_deleted', `Photo deleted from ${item.code}`, doc.caption || doc.fileName);
    });
    if (publicId) await dropAsset(publicId);
    return { ok: true };
  } finally {
    await session.endSession();
  }
}
