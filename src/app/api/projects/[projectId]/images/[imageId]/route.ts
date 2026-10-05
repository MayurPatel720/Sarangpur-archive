import { handleMultipart, handleMutation } from '@/lib/api';
import { z } from 'zod';
import {
  projectImageDeleteResponseSchema,
  projectImagePatchBodySchema,
  projectImageResponseSchema,
} from '@/types/project-image';
import {
  deleteProjectImage,
  parseUpload,
  replaceProjectImage,
  updateProjectImage,
} from '@/server/projects/images';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

type Ctx = { params: Promise<{ projectId: string; imageId: string }> };

/** PATCH /api/projects/[projectId]/images/[imageId] — edit caption / format tag. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { projectId, imageId } = await params;
  return handleMutation(req, projectImagePatchBodySchema, projectImageResponseSchema, {
    permission: 'project:view', // project:edit or lot assignee, enforced in the server layer
    run: (body, ctx) => updateProjectImage(projectId, imageId, body, ctx),
  });
}

/** PUT /api/projects/[projectId]/images/[imageId] — replace the file (multipart), keeping caption / tag. */
export async function PUT(req: Request, { params }: Ctx) {
  const { projectId, imageId } = await params;
  return handleMultipart(req, projectImageResponseSchema, {
    permission: 'project:view',
    maxBytes: MAX_BODY_BYTES,
    run: (form, ctx) => replaceProjectImage(projectId, imageId, parseUpload(form), ctx),
  });
}

/** DELETE /api/projects/[projectId]/images/[imageId] — remove the document and its Cloudinary asset. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { projectId, imageId } = await params;
  return handleMutation(req, z.unknown(), projectImageDeleteResponseSchema, {
    permission: 'project:view',
    run: (_body, ctx) => deleteProjectImage(projectId, imageId, ctx),
  });
}
