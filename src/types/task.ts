import { z } from 'zod';
import { FORMATS, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/domain';
import { severitySchema } from './dashboard';

/**
 * Task contracts (Module: daily work). Same wire rules as the rest of the app:
 * ids are plain strings, timestamps ISO strings, and `dueDate` is a calendar day
 * `YYYY-MM-DD`. Every response below is Zod-parsed on the server before it leaves.
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');
export const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');

export const MAX_ASSIGNEES = 20;

export const taskFormatSchema = z.enum(FORMATS);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

/** One person on a task (name denormalised at write time). */
export const taskAssigneeSchema = z.object({ id: z.string(), name: z.string() });
export type TaskAssignee = z.infer<typeof taskAssigneeSchema>;

/* --------------------------------------------------------------------- rows */

/** One task as a card / table row. No checklist or comment bodies — only counters. */
export const taskRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  format: taskFormatSchema,
  status: taskStatusSchema,
  blockedReason: z.string().nullable(),
  priority: taskPrioritySchema,
  dueDate: z.string().nullable(),
  /** Open and due before the caller's "today". */
  overdue: z.boolean(),
  /** 1+ people; status / checklist are shared across them. */
  assignees: z.array(taskAssigneeSchema),
  createdById: z.string(),
  createdByName: z.string(),
  lotId: z.string().nullable(),
  lotCode: z.string().nullable(),
  projectId: z.string().nullable(),
  projectCode: z.string().nullable(),
  checklistTotal: z.number(),
  checklistDone: z.number(),
  commentCount: z.number(),
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskRow = z.infer<typeof taskRowSchema>;

/* --------------------------------------------------------------------- list */

/**
 * Filters shared by the list endpoint and the Tasks page. `assignee` takes a user id or
 * `me` and matches a task when that person is ANY of its assignees. Non-admins are always confined to tasks they are assignee or creator of —
 * `assignee`/`createdBy` narrow within that, they never widen it.
 */
export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  format: taskFormatSchema.optional(),
  assignee: z.union([z.literal('me'), objectIdSchema]).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  /** Bucket by due date, relative to `today`. */
  due: z.enum(['overdue', 'today', 'upcoming', 'none']).optional(),
  dueFrom: isoDaySchema.optional(),
  dueTo: isoDaySchema.optional(),
  lot: objectIdSchema.optional(),
  project: objectIdSchema.optional(),
  q: z.string().trim().max(120).optional(),
  /** The caller's local calendar day. Defaults to the server's UTC day. */
  today: isoDaySchema.optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskListResponseSchema = z.object({
  rows: z.array(taskRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

/* -------------------------------------------------------------------- panel */

export const taskPanelQuerySchema = z.object({
  format: taskFormatSchema.optional(),
  /** Admin only: narrow to one person (the per-person strip). */
  assignee: objectIdSchema.optional(),
  today: isoDaySchema.optional(),
});
export type TaskPanelQuery = z.infer<typeof taskPanelQuerySchema>;

const taskGroupSchema = z.object({ rows: z.array(taskRowSchema), total: z.number() });

/** A lot currently assigned to the viewer, shown read-only as a task-like row. */
export const derivedTaskSchema = z.object({
  lotId: z.string(),
  lotCode: z.string(),
  format: z.string(),
  stage: z.string(),
  /** What the stage asks of the assignee: Decide / Scan / Tag … */
  action: z.string(),
  stageEnteredAt: z.string(),
});
export type DerivedTask = z.infer<typeof derivedTaskSchema>;

export const taskPersonCountSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  open: z.number(),
  overdue: z.number(),
  blocked: z.number(),
});
export type TaskPersonCount = z.infer<typeof taskPersonCountSchema>;

export const taskPanelResponseSchema = z.object({
  today: z.string(),
  overdue: taskGroupSchema,
  dueToday: taskGroupSchema,
  /** Open tasks due after today, or with no due date. */
  upcoming: taskGroupSchema,
  doneRecently: taskGroupSchema,
  derived: z.object({ rows: z.array(derivedTaskSchema), total: z.number() }),
  /** Admin only (`task:viewAll`); empty for everyone else. Ignores the assignee filter. */
  people: z.array(taskPersonCountSchema),
});
export type TaskPanelResponse = z.infer<typeof taskPanelResponseSchema>;

/* ------------------------------------------------------------------- detail */

export const taskChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});
export type TaskChecklistItem = z.infer<typeof taskChecklistItemSchema>;

export const taskCommentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  at: z.string(),
});
export type TaskComment = z.infer<typeof taskCommentSchema>;

export const taskHistoryEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  detail: z.string(),
  actorName: z.string(),
  at: z.string(),
  severity: severitySchema,
});
export type TaskHistoryEntry = z.infer<typeof taskHistoryEntrySchema>;

export const taskDetailResponseSchema = z.object({
  task: taskRowSchema.extend({
    description: z.string().nullable(),
    checklist: z.array(taskChecklistItemSchema),
    comments: z.array(taskCommentSchema),
  }),
  history: z.array(taskHistoryEntrySchema),
  /** What the caller may do — computed server-side so the UI never re-derives the rules. */
  can: z.object({
    changeStatus: z.boolean(),
    cancel: z.boolean(),
    edit: z.boolean(),
  }),
});
export type TaskDetailResponse = z.infer<typeof taskDetailResponseSchema>;

/* ------------------------------------------------------------------- writes */

export const taskCreateBodySchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title.').max(160),
  description: z.string().trim().max(2000).optional(),
  assigneeIds: z.array(objectIdSchema).min(1, 'Pick at least one assignee.').max(MAX_ASSIGNEES),
  priority: taskPrioritySchema.default('normal'),
  dueDate: isoDaySchema.optional(),
  /** Required unless `lotId` is given — a linked lot's format wins. */
  format: taskFormatSchema.optional(),
  lotId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});
export type TaskCreateBody = z.infer<typeof taskCreateBodySchema>;
export type TaskCreateInput = z.input<typeof taskCreateBodySchema>;

/**
 * Admin edit. `assigneeIds` is the FULL new set of assignees (the server diffs it: added
 * people are notified, removed people get a notice); null clears the due date / links.
 * Setting `lotId` makes the format follow the lot; removing the lot keeps the format.
 */
export const taskUpdateBodySchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  assigneeIds: z.array(objectIdSchema).min(1, 'A task needs at least one assignee.').max(MAX_ASSIGNEES).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: isoDaySchema.nullable().optional(),
  format: taskFormatSchema.optional(),
  lotId: objectIdSchema.nullable().optional(),
  projectId: objectIdSchema.nullable().optional(),
});
export type TaskUpdateBody = z.infer<typeof taskUpdateBodySchema>;


export const taskStatusBodySchema = z
  .object({
    status: taskStatusSchema,
    blockedReason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.status !== 'blocked' || (b.blockedReason ?? '').length > 0, {
    message: 'Say what is blocking the task.',
    path: ['blockedReason'],
  });
export type TaskStatusBody = z.infer<typeof taskStatusBodySchema>;

export const taskCommentBodySchema = z.object({ text: z.string().trim().min(1).max(2000) });
export type TaskCommentBody = z.infer<typeof taskCommentBodySchema>;

/** Full replacement. Items with an `id` keep it; items without are new. */
export const taskChecklistBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: objectIdSchema.optional(),
        text: z.string().trim().min(1).max(200),
        done: z.boolean(),
      }),
    )
    .max(50),
});
export type TaskChecklistBody = z.infer<typeof taskChecklistBodySchema>;

/** Create / update / status / comment / checklist all answer with the fresh detail. */
export const taskMutationResponseSchema = taskDetailResponseSchema;
export type TaskMutationResponse = TaskDetailResponse;
