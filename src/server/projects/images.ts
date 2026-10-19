import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { destroyImage, uploadImage } from '@/server/cloudinary';
import { connectToDatabase } from '@/lib/mongo';
import { FORMATS, type ActivityKind, type Format } from '@/lib/domain';
import { canManageProjectImages } from '@/server/permissions';
import { ActivityLog } from '@/models/ActivityLog';
import { ArchiveLot } from '@/models/ArchiveLot';
import { Project } from '@/models/Project';
import { ProjectImage, type ProjectImageDoc } from '@/models/ProjectImage';
import {
  PHOTO_MAX_CAPTION,
  PHOTO_MAX_UPLOAD_BYTES,
  type ProjectImage as ProjectImageDto,
  type ProjectImagePatchBody,
  type ProjectImagesResponse,
} from '@/types/project-image';

/**
 * Project photos. Bytes live in Cloudinary (public delivery URLs); MongoDB holds metadata.
 *
 * Every write follows the project-mutation contract (see `mutations.ts`): the
 * document change and its `ActivityLog` entry commit in ONE transaction. Cloudinary I/O
 * cannot join a Mongo transaction, so the ordering keeps orphans harmless:
 *   - create / replace: upload the new asset FIRST, then commit; if the commit
 *     fails the fresh asset is destroyed (best effort).
 *   - delete / replace: the OLD asset is destroyed only AFTER the commit, so a failure
 *     can never leave a document pointing at a missing file.
 */

/* -------------------------------------------------------------------- pure */

export interface ParsedUpload {
  file: File;
  caption: string | undefined;
  format: Format | null | undefined;
  width: number | null;
  height: number | null;
}

function dimension(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
}

/** Validates a multipart body: an image file plus optional caption / format / dimensions. */
export function parseUpload(form: FormData): ParsedUpload {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new HttpError(400, 'Choose an image file to upload.');
  }
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new HttpError(400, 'Only image files (JPEG, PNG, WebP, GIF, HEIC) can be uploaded.');
  }
  if (file.size > PHOTO_MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'That photo is too large to upload. Photos must be under 4 MB after resizing.');
  }

  const captionRaw = form.get('caption');
  const caption = typeof captionRaw === 'string' ? captionRaw.trim() : undefined;
  if (caption !== undefined && caption.length > PHOTO_MAX_CAPTION) {
    throw new HttpError(400, `Caption must be ${PHOTO_MAX_CAPTION} characters or fewer.`);
  }

  const formatRaw = form.get('format');
  let format: Format | null | undefined;
  if (typeof formatRaw === 'string' && formatRaw !== '') {
    if (!(FORMATS as readonly string[]).includes(formatRaw)) throw new HttpError(400, 'Unknown format tag.');
    format = formatRaw as Format;
  }

  return {
    file,
    caption,
    format,
    width: dimension(form.get('width')),
    height: dimension(form.get('height')),
  };
}

/* ------------------------------------------------------------------ helpers */

export function shapeProjectImage(
  d: ProjectImageDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date },
): ProjectImageDto {
  return {
    id: String(d._id),
    url: d.url,
    fileName: d.fileName,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    width: d.width ?? null,
    height: d.height ?? null,
    caption: d.caption ?? '',
    format: (d.format as Format | null | undefined) ?? null,
    uploadedById: String(d.uploadedBy),
    uploadedByName: d.uploadedByName,
    createdAt: (d.createdAt ?? new Date(0)).toISOString(),
    updatedAt: (d.updatedAt ?? new Date(0)).toISOString(),
  };
}

function assertImageId(imageId: string): void {
  if (!Types.ObjectId.isValid(imageId)) throw new HttpError(404, 'Photo not found.');
}

/** True when the user is the assignee of at least one lot of the project. */
async function isProjectLotAssignee(projectId: string, userId: string): Promise<boolean> {
  const pid = new Types.ObjectId(projectId);
  const hit = await ArchiveLot.exists({
    assignee: new Types.ObjectId(userId),
    $or: [{ projectIds: pid }, { syncProjectId: pid }],
  });
  return hit !== null;
}

async function canManage(projectId: string, ctx: MutationContext): Promise<boolean> {
  if (canManageProjectImages(ctx.grants, false)) return true;
  return isProjectLotAssignee(projectId, ctx.userId);
}

async function assertCanManage(projectId: string, ctx: MutationContext): Promise<void> {
  if (!(await canManage(projectId, ctx))) {
    throw new HttpError(403, 'Only project editors or assignees of this project can manage its photos.');
  }
}

async function loadProject(projectId: string): Promise<{ id: string; code: string }> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(projectId)) throw new HttpError(404, 'Project not found.');
  const project = await Project.findById(projectId).select('code').lean();
  if (!project) throw new HttpError(404, 'Project not found.');
  return { id: String(project._id), code: project.code };
}

async function logImageActivity(
  session: ClientSession,
  project: { id: string; code: string },
  ctx: MutationContext,
  entry: {
    kind: ActivityKind;
    title: string;
    detail?: string;
    changes?: { field: string; from: unknown; to: unknown }[];
  },
): Promise<void> {
  await ActivityLog.create(
    [
      {
        lot: null,
        lotCode: null,
        project: new Types.ObjectId(project.id),
        projectCode: project.code,
        kind: entry.kind,
        title: entry.title,
        detail: entry.detail ?? null,
        actor: new Types.ObjectId(ctx.userId),
        actorName: ctx.userName,
        at: new Date(),
        changes: entry.changes ?? [],
      },
    ],
    { session },
  );
}

/** Uploads into this project's Cloudinary folder. */
const putAsset = (projectId: string, file: File) =>
  uploadImage(`archive-tracker/projects/${projectId}`, file);

const dropAsset = destroyImage;

/* -------------------------------------------------------------------- reads */

/** Newest first. `can.manage` tells the UI whether to show add / edit / replace / delete. */
export async function listProjectImages(projectId: string, ctx: MutationContext): Promise<ProjectImagesResponse> {
  await loadProject(projectId);
  const [docs, manage] = await Promise.all([
    ProjectImage.find({ project: new Types.ObjectId(projectId) })
      .sort({ createdAt: -1 })
      .lean(),
    canManage(projectId, ctx),
  ]);
  return { images: docs.map(shapeProjectImage), can: { manage } };
}

/* ------------------------------------------------------------------- writes */

export async function addProjectImage(
  projectId: string,
  upload: ParsedUpload,
  ctx: MutationContext,
): Promise<{ image: ProjectImageDto }> {
  const project = await loadProject(projectId);
  await assertCanManage(projectId, ctx);
  const stored = await putAsset(projectId, upload.file);

  const session = await ProjectImage.startSession();
  try {
    let created: ProjectImageDto | null = null;
    await session.withTransaction(async () => {
      const [doc] = await ProjectImage.create(
        [
          {
            project: new Types.ObjectId(projectId),
            url: stored.url,
            publicId: stored.publicId,
            fileName: stored.fileName,
            contentType: stored.contentType,
            sizeBytes: stored.bytes,
            width: stored.width ?? upload.width,
            height: stored.height ?? upload.height,
            caption: upload.caption ?? '',
            format: upload.format ?? null,
            uploadedBy: new Types.ObjectId(ctx.userId),
            uploadedByName: ctx.userName,
          },
        ],
        { session },
      );
      if (!doc) throw new HttpError(500, 'Could not save the photo.');
      await logImageActivity(session, project, ctx, {
        kind: 'project_image_added',
        title: `Photo added to ${project.code}`,
        detail: upload.caption || stored.fileName,
      });
      created = shapeProjectImage(doc.toObject());
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

export async function updateProjectImage(
  projectId: string,
  imageId: string,
  body: ProjectImagePatchBody,
  ctx: MutationContext,
): Promise<{ image: ProjectImageDto }> {
  const project = await loadProject(projectId);
  assertImageId(imageId);
  await assertCanManage(projectId, ctx);

  const session = await ProjectImage.startSession();
  try {
    let out: ProjectImageDto | null = null;
    await session.withTransaction(async () => {
      const doc = await ProjectImage.findOne({ _id: imageId, project: projectId }).session(session);
      if (!doc) throw new HttpError(404, 'Photo not found.');

      const changes: { field: string; from: unknown; to: unknown }[] = [];
      if (body.caption !== undefined && body.caption !== doc.caption) {
        changes.push({ field: 'caption', from: doc.caption, to: body.caption });
        doc.caption = body.caption;
      }
      if (body.format !== undefined && body.format !== (doc.format ?? null)) {
        changes.push({ field: 'format', from: doc.format ?? null, to: body.format });
        doc.format = body.format;
      }
      if (changes.length > 0) {
        await doc.save({ session });
        await logImageActivity(session, project, ctx, {
          kind: 'project_image_updated',
          title: `Photo updated on ${project.code}`,
          detail: doc.fileName,
          changes,
        });
      }
      out = shapeProjectImage(doc.toObject());
    });
    if (!out) throw new HttpError(404, 'Photo not found.');
    return { image: out };
  } finally {
    await session.endSession();
  }
}

export async function replaceProjectImage(
  projectId: string,
  imageId: string,
  upload: ParsedUpload,
  ctx: MutationContext,
): Promise<{ image: ProjectImageDto }> {
  const project = await loadProject(projectId);
  assertImageId(imageId);
  await assertCanManage(projectId, ctx);
  const stored = await putAsset(projectId, upload.file);

  const session = await ProjectImage.startSession();
  try {
    let out: ProjectImageDto | null = null;
    let oldPublicId: string | null = null;
    await session.withTransaction(async () => {
      const doc = await ProjectImage.findOne({ _id: imageId, project: projectId }).session(session);
      if (!doc) throw new HttpError(404, 'Photo not found.');
      oldPublicId = doc.publicId;
      const before = doc.fileName;
      // Caption and format tag are kept; only the file and its facts change.
      doc.url = stored.url;
      doc.publicId = stored.publicId;
      doc.fileName = stored.fileName;
      doc.contentType = stored.contentType;
      doc.sizeBytes = stored.bytes;
      doc.width = stored.width ?? upload.width;
      doc.height = stored.height ?? upload.height;
      await doc.save({ session });
      await logImageActivity(session, project, ctx, {
        kind: 'project_image_replaced',
        title: `Photo replaced on ${project.code}`,
        detail: doc.caption || stored.fileName,
        changes: [{ field: 'file', from: before, to: stored.fileName }],
      });
      out = shapeProjectImage(doc.toObject());
    });
    if (!out) throw new HttpError(404, 'Photo not found.');
    if (oldPublicId) await dropAsset(oldPublicId);
    return { image: out };
  } catch (error) {
    await dropAsset(stored.publicId);
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function deleteProjectImage(
  projectId: string,
  imageId: string,
  ctx: MutationContext,
): Promise<{ ok: true }> {
  const project = await loadProject(projectId);
  assertImageId(imageId);
  await assertCanManage(projectId, ctx);

  const session = await ProjectImage.startSession();
  try {
    let publicId: string | null = null;
    await session.withTransaction(async () => {
      const doc = await ProjectImage.findOneAndDelete({ _id: imageId, project: projectId }, { session });
      if (!doc) throw new HttpError(404, 'Photo not found.');
      publicId = doc.publicId;
      await logImageActivity(session, project, ctx, {
        kind: 'project_image_deleted',
        title: `Photo deleted from ${project.code}`,
        detail: doc.caption || doc.fileName,
      });
    });
    if (publicId) await dropAsset(publicId);
    return { ok: true };
  } finally {
    await session.endSession();
  }
}
