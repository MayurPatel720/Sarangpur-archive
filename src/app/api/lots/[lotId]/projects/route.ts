import { handleQuery } from '@/lib/api';
import { lotProjectsResponseSchema } from '@/types/project';
import { getLotProjects } from '@/server/projects/queries';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/projects — projects this lot belongs to, `lot:view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleQuery(lotProjectsResponseSchema, () => getLotProjects(lotId), {
    permission: 'lot:view',
  });
}
