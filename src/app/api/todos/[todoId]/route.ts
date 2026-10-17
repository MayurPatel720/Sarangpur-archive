import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { todoDeleteResponseSchema, todoPatchBodySchema, todoResponseSchema } from '@/types/todo';
import { deleteTodo, updateTodo } from '@/server/todos/mutations';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ todoId: string }> };

/** PATCH /api/todos/[todoId] — edit, move between quadrants, complete / reopen, link a delegated task. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { todoId } = await params;
  return handleMutation(req, todoPatchBodySchema, todoResponseSchema, {
    permission: 'task:view',
    run: (body, ctx) => updateTodo(todoId, body, ctx),
  });
}

/** DELETE /api/todos/[todoId] — remove one of MY to-dos. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { todoId } = await params;
  return handleMutation(req, z.unknown(), todoDeleteResponseSchema, {
    permission: 'task:view',
    run: (_body, ctx) => deleteTodo(todoId, ctx),
  });
}
