import { NextResponse } from 'next/server';
import { handleMutation, handleQuery } from '@/lib/api';
import {
  projectCreateBodySchema,
  projectCreateResponseSchema,
  projectListQuerySchema,
  projectListResponseSchema,
} from '@/types/project';
import { listProjects } from '@/server/projects/queries';
import { createProject } from '@/server/projects/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/projects — paginated project list, `project:view`. */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = projectListQuerySchema.safeParse(params);
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
  return handleQuery(projectListResponseSchema, () => listProjects(parsed.data), {
    permission: 'project:view',
  });
}

/** POST /api/projects — admin creates a project, `project:create`. → 201. */
export async function POST(req: Request) {
  return handleMutation(req, projectCreateBodySchema, projectCreateResponseSchema, {
    permission: 'project:create',
    status: 201,
    run: (body, ctx) => createProject(body, ctx),
  });
}
