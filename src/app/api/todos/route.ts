import { handleMutation, handleQuery, parseQueryParams } from '@/lib/api';
import { todoCreateBodySchema, todoListQuerySchema, todoListResponseSchema, todoResponseSchema } from '@/types/todo';
import { listTodos } from '@/server/todos/queries';
import { createTodo } from '@/server/todos/mutations';

export const dynamic = 'force-dynamic';

/** GET /api/todos — MY personal to-dos, filtered / sorted / paged. Private: only the caller's own. */
export async function GET(req: Request) {
  return handleQuery(todoListResponseSchema, (ctx) => listTodos(parseQueryParams(todoListQuerySchema, req), ctx!), {
    permission: 'task:view',
  });
}

/** POST /api/todos — add a to-do to my list (max 500 open). → 201. */
export async function POST(req: Request) {
  return handleMutation(req, todoCreateBodySchema, todoResponseSchema, {
    permission: 'task:view',
    status: 201,
    run: (body, ctx) => createTodo(body, ctx),
  });
}
