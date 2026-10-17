import { z } from 'zod';
import { QUADRANT_IDS } from '@/lib/todo';

/**
 * Personal to-do contracts (Eisenhower matrix). Private: every read and write is limited to the
 * signed-in user. Paginated on the server (AGENTS rule 6); the matrix asks for all open ones
 * (capped at MAX_OPEN_TODOS) in one page.
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');
const dayRegex = /^\d{4}-\d{2}-\d{2}$/;

export const quadrantSchema = z.enum(QUADRANT_IDS);

export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  urgent: z.boolean(),
  important: z.boolean(),
  quadrant: quadrantSchema,
  dueDate: z.string().nullable(),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  delegatedTaskId: z.string().nullable(),
  delegatedTaskTitle: z.string().nullable(),
  createdAt: z.string(),
});
export type Todo = z.output<typeof todoSchema>;

export const todoListQuerySchema = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  quadrant: quadrantSchema.optional(),
  sort: z.enum(['created', 'due', 'title', 'quadrant']).default('created'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type TodoListQuery = z.output<typeof todoListQuerySchema>;
export type TodoListQueryInput = z.input<typeof todoListQuerySchema>;

export const todoListResponseSchema = z.object({
  rows: z.array(todoSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  /** Open to-dos per quadrant (ignores the status / quadrant filters). */
  counts: z.object({ do: z.number(), schedule: z.number(), delegate: z.number(), delete: z.number() }),
  openTotal: z.number(),
});
export type TodoListResponse = z.output<typeof todoListResponseSchema>;

export const todoCreateBodySchema = z.object({
  title: z.string().trim().min(1, 'Give the to-do a title.').max(160),
  note: z.string().trim().max(1000).optional(),
  urgent: z.boolean(),
  important: z.boolean(),
  dueDate: z.string().regex(dayRegex, 'Expected a YYYY-MM-DD date.').optional(),
});
export type TodoCreateBody = z.input<typeof todoCreateBodySchema>;

export const todoPatchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    note: z.string().trim().max(1000).nullable().optional(),
    urgent: z.boolean().optional(),
    important: z.boolean().optional(),
    dueDate: z.string().regex(dayRegex).nullable().optional(),
    done: z.boolean().optional(),
    /** Links the assigned Task created from the Delegate quadrant (must be one the caller created). */
    delegatedTaskId: objectIdSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export type TodoPatchBody = z.input<typeof todoPatchBodySchema>;

export const todoResponseSchema = z.object({ todo: todoSchema });
export type TodoResponse = z.output<typeof todoResponseSchema>;

export const todoDeleteResponseSchema = z.object({ ok: z.literal(true) });
