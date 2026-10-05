import { handleMultipart, handleQuery } from '@/lib/api';
import { projectImageResponseSchema, projectImagesResponseSchema } from '@/types/project-image';
import { addProjectImage, listProjectImages, parseUpload } from '@/server/projects/images';

export const dynamic = 'force-dynamic';

/** Multipart body ceiling: the 4 MB file plus form-field overhead, under Vercel's 4.5 MB cap. */
const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

/** GET /api/projects/[projectId]/images — gallery, newest first, `project:view`. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return handleQuery(projectImagesResponseSchema, (ctx) => listProjectImages(projectId, ctx!), {
    permission: 'project:view',
  });
}

/** POST /api/projects/[projectId]/images — upload ONE photo (multipart: file, caption?, format?). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return handleMultipart(req, projectImageResponseSchema, {
    permission: 'project:view', // fine-grained check (project:edit or lot assignee) lives in the server layer
    maxBytes: MAX_BODY_BYTES,
    status: 201,
    run: (form, ctx) => addProjectImage(projectId, parseUpload(form), ctx),
  });
}
