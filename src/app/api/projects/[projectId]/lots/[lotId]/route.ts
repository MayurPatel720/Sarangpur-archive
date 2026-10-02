import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { projectAssignResponseSchema } from '@/types/project';
import { unassignLot } from '@/server/projects/mutations';

export const dynamic = 'force-dynamic';

/** DELETE /api/projects/[projectId]/lots/[lotId] — admin removes a lot, `project:assign`. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string; lotId: string }> },
) {
  const { projectId, lotId } = await params;
  return handleMutation(req, z.object({}).strict(), projectAssignResponseSchema, {
    permission: 'project:assign',
    run: (_body, ctx) => unassignLot(projectId, lotId, ctx),
  });
}
