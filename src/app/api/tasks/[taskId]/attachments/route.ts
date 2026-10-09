import { z } from 'zod';
import { handleMultipart, handleMutation } from '@/lib/api';
import { taskAttachmentResponseSchema } from '@/types/task';
import { discardTaskImage, uploadTaskImage } from '@/server/tasks/attachments';

export const dynamic = 'force-dynamic';

/** Multipart body ceiling: the 4 MB image plus form overhead, under Vercel's 4.5 MB cap. */
const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

/** POST /api/tasks/[taskId]/attachments — upload ONE comment image (multipart: file), `task:view`. */
export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMultipart(req, taskAttachmentResponseSchema, {
    permission: 'task:view',
    maxBytes: MAX_BODY_BYTES,
    status: 201,
    run: (form, ctx) => uploadTaskImage(taskId, form, ctx),
  });
}

/** DELETE /api/tasks/[taskId]/attachments — drop an image that was uploaded but never posted. */
export async function DELETE(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return handleMutation(req, z.object({ publicId: z.string().min(1).max(300) }), z.object({ ok: z.literal(true) }), {
    permission: 'task:view',
    run: (body, ctx) => discardTaskImage(taskId, body.publicId, ctx),
  });
}
