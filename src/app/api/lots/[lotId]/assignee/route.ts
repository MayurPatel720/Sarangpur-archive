import { handleMutation } from '@/lib/api';
import { z } from 'zod';
import { lotAssigneeBodySchema } from '@/types/project';
import { setLotAssignee } from '@/server/projects/mutations';

export const dynamic = 'force-dynamic';

const responseSchema = z.object({
  lotId: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
});

/** PUT /api/lots/[lotId]/assignee — admin (re)assigns or clears the owner, `project:assign`. */
export async function PUT(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, lotAssigneeBodySchema, responseSchema, {
    permission: 'project:assign',
    run: (body, ctx) => setLotAssignee(lotId, body, ctx),
  });
}
