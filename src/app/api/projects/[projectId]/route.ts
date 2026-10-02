import { NextResponse } from 'next/server';
import { handleMutation, handleQuery } from '@/lib/api';
import {
  projectDetailQuerySchema,
  projectDetailResponseSchema,
  projectUpdateBodySchema,
  projectUpdateResponseSchema,
} from '@/types/project';
import { getProjectDetail } from '@/server/projects/queries';
import { updateProject } from '@/server/projects/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/projects/[projectId] — header + progress + member lots + activity, `project:view`. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const queryParams = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = projectDetailQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: first
          ? `Invalid query: ${first.path.join('.') || 'query'} — ${first.message}`
          : 'Invalid query.',
      },
      { status: 400 },
    );
  }
  return handleQuery(projectDetailResponseSchema, () => getProjectDetail(projectId, parsed.data), {
    permission: 'project:view',
  });
}

/** PATCH /api/projects/[projectId] — admin edits a project, `project:edit`. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return handleMutation(req, projectUpdateBodySchema, projectUpdateResponseSchema, {
    permission: 'project:edit',
    run: (body, ctx) => updateProject(projectId, body, ctx),
  });
}
