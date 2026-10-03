import { handleMutation } from '@/lib/api';
import { z } from 'zod';
import { projectAddMediaBodySchema } from '@/types/project';
import { addProjectMedia } from '@/server/projects/mutations';

export const dynamic = 'force-dynamic';

const responseSchema = z.object({
  lots: z.array(
    z.object({ id: z.string(), lotReference: z.string(), format: z.string(), created: z.boolean() }),
  ),
});

/** POST /api/projects/[projectId]/media — admin adds media (new format → new child lot), `project:edit`. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return handleMutation(req, projectAddMediaBodySchema, responseSchema, {
    permission: 'project:edit',
    run: (body, ctx) => addProjectMedia(projectId, body, ctx),
  });
}
