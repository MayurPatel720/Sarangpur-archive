import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { ActivityLog } from '@/models/ActivityLog';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotImage, type LotImageDoc } from '@/models/LotImage';
import { canWorkLot } from '@/server/lots/access';
import { can } from '@/server/permissions';
import { dropAsset, putAsset, type ParsedUpload } from '@/server/projects/images';
import type { LotImage as LotImageDto, LotImagesResponse } from '@/types/lot-image';

/**
 * Lot photos. Bytes live in Cloudinary; MongoDB holds metadata. Same ordering rules as project
 * photos: upload first then commit (a failed commit destroys the fresh asset), and the old asset
 * is destroyed only AFTER a delete commits. Managing needs `lot:edit` and the assignee rule
 * (`canWorkLot`); viewing rides on `lot:view`.
 */

type LotHead = { _id: Types.ObjectId; lotReference: string; format: string; assignee?: unknown; assigneeName?: string | null; syncProjectId?: unknown };

export function shapeLotImage(d: LotImageDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date }): LotImageDto {
  return {
    id: String(d._id),
    url: d.url,
    fileName: d.fileName,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    width: d.width ?? null,
    height: d.height ?? null,
    caption: d.caption ?? '',
    uploadedById: String(d.uploadedBy),
    uploadedByName: d.uploadedByName,
    createdAt: (d.createdAt ?? new Date(0)).toISOString(),
    updatedAt: (d.updatedAt ?? new Date(0)).toISOString(),
  };
}

async function loadLot(lotId: string): Promise<LotHead> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const lot = (await ArchiveLot.findById(lotId).select('lotReference format assignee assigneeName syncProjectId').lean()) as LotHead | null;
  if (!lot) throw new HttpError(404, 'Lot not found.');
  return lot;
}

const canManage = (lot: LotHead, ctx: MutationContext) =>
  can(ctx.grants, 'lot:edit') && canWorkLot(lot, { id: ctx.userId, grants: ctx.grants });

function assertCanManage(lot: LotHead, ctx: MutationContext): void {
  if (!can(ctx.grants, 'lot:edit')) throw new HttpError(403, 'You need the lot:edit permission to manage photos.');
  if (!canWorkLot(lot, { id: ctx.userId, grants: ctx.grants })) {
    throw new HttpError(403, 'Only the lot’s assignee or an admin can manage its photos.');
  }
}

async function logActivity(
  session: import('mongoose').ClientSession,
  lot: LotHead,
  ctx: MutationContext,
  kind: 'lot_image_added' | 'lot_image_deleted',
  title: string,
  detail: string,
) {
  await ActivityLog.create(
    [
      {
        lot: lot._id,
        lotCode: lot.lotReference,
        format: lot.format,
        kind,
        title,
        detail,
        actor: new Types.ObjectId(ctx.userId),
        actorName: ctx.userName,
        at: new Date(),
        changes: [],
      },
    ],
    { session },
  );
}

export async function listLotImages(lotId: string, ctx: MutationContext): Promise<LotImagesResponse> {
  const lot = await loadLot(lotId);
  const docs = await LotImage.find({ lot: lot._id }).sort({ createdAt: -1 }).lean();
  return { images: docs.map(shapeLotImage), can: { manage: canManage(lot, ctx) } };
}

export async function addLotImage(lotId: string, upload: ParsedUpload, ctx: MutationContext): Promise<{ image: LotImageDto }> {
  const lot = await loadLot(lotId);
  assertCanManage(lot, ctx);
  const stored = await putAsset(`lots/${lotId}`, upload.file);

  const session = await LotImage.startSession();
  try {
    let created: LotImageDto | null = null;
    await session.withTransaction(async () => {
      const [doc] = await LotImage.create(
        [
          {
            lot: lot._id,
            url: stored.url,
            publicId: stored.publicId,
            fileName: stored.fileName,
            contentType: stored.contentType,
            sizeBytes: stored.bytes,
            width: stored.width ?? upload.width,
            height: stored.height ?? upload.height,
            caption: upload.caption ?? '',
            uploadedBy: new Types.ObjectId(ctx.userId),
            uploadedByName: ctx.userName,
          },
        ],
        { session },
      );
      if (!doc) throw new HttpError(500, 'Could not save the photo.');
      await logActivity(session, lot, ctx, 'lot_image_added', `Photo added to ${lot.lotReference}`, upload.caption || stored.fileName);
      created = shapeLotImage(doc.toObject());
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

export async function deleteLotImage(lotId: string, imageId: string, ctx: MutationContext): Promise<{ ok: true }> {
  const lot = await loadLot(lotId);
  if (!Types.ObjectId.isValid(imageId)) throw new HttpError(404, 'Photo not found.');
  assertCanManage(lot, ctx);

  const session = await LotImage.startSession();
  try {
    let publicId: string | null = null;
    await session.withTransaction(async () => {
      const doc = await LotImage.findOneAndDelete({ _id: imageId, lot: lot._id }, { session });
      if (!doc) throw new HttpError(404, 'Photo not found.');
      publicId = doc.publicId;
      await logActivity(session, lot, ctx, 'lot_image_deleted', `Photo deleted from ${lot.lotReference}`, doc.caption || doc.fileName);
    });
    if (publicId) await dropAsset(publicId);
    return { ok: true };
  } finally {
    await session.endSession();
  }
}
