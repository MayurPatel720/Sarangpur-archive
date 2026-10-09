import { Types } from 'mongoose';
import { HttpError, type MutationContext } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { Task } from '@/models/Task';
import { destroyImage, uploadImage } from '@/server/cloudinary';
import { parseUpload } from '@/server/projects/images';
import { canActOnTask } from './queries';
import { taskImageFolder } from './mutations';
import type { TaskAttachment } from '@/types/task';

/**
 * Comment images. The browser uploads each picture first (one request per file, so a
 * phone photo never blows the 4.5 MB body limit); the comment then references the
 * returned metadata. Only people who may act on the task can upload, and a picture can
 * only be removed again while no comment uses it.
 */

async function loadActable(taskId: string, ctx: MutationContext) {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(taskId)) throw new HttpError(404, 'Task not found.');
  const task = await Task.findById(taskId).select('assignees createdBy personal comments').lean();
  if (!task) throw new HttpError(404, 'Task not found.');
  if (!canActOnTask(task, ctx)) {
    throw new HttpError(403, 'Only an assignee, the person who set the task, or an admin can add images.');
  }
  return task;
}

export async function uploadTaskImage(taskId: string, form: FormData, ctx: MutationContext): Promise<TaskAttachment> {
  await loadActable(taskId, ctx);
  const { file, width, height } = parseUpload(form);
  const stored = await uploadImage(taskImageFolder(taskId), file);
  return {
    url: stored.url,
    publicId: stored.publicId,
    fileName: stored.fileName,
    contentType: stored.contentType,
    sizeBytes: stored.bytes,
    width: stored.width ?? width,
    height: stored.height ?? height,
  };
}

/** Removes an image that was uploaded but never posted. Refuses one a comment already uses. */
export async function discardTaskImage(taskId: string, publicId: string, ctx: MutationContext): Promise<{ ok: true }> {
  const task = await loadActable(taskId, ctx);
  if (!publicId.startsWith(`${taskImageFolder(taskId)}/`)) throw new HttpError(400, 'That image does not belong to this task.');
  const used = (task.comments ?? []).some((c) => (c.attachments ?? []).some((a) => a.publicId === publicId));
  if (used) throw new HttpError(409, 'That image is already part of a comment.');
  await destroyImage(publicId);
  return { ok: true };
}
