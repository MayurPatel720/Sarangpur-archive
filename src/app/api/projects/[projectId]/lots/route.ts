import { handleMutation } from '@/lib/api';
import { projectAssignBodySchema, projectAssignResponseSchema } from '@/types/project';
import { assignLot } from '@/server/projects/mutations';

export const dynamic = 'force-dynamic';

/** POST /api/projects/[projectId]/lots — admin adds a lot, `project:assign`. Idempotent. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return handleMutation(req, projectAssignBodySchema, projectAssignResponseSchema, {
    permission: 'project:assign',
    run: (body, ctx) => assignLot(projectId, body, ctx),
  });
}
