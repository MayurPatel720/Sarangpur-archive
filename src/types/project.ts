import { z } from 'zod';
import { activityEntrySchema } from './dashboard';
import { lotListResponseSchema } from './lot';

/**
 * Project contracts (Module: projects).
 *
 * Wire rule, same as lots: writes carry ISO datetimes with offset and plain
 * id strings; responses echo ISO strings. `code` is admin-typed free text —
 * the server only enforces presence + uniqueness.
 */

/* ------------------------------------------------------------------ shared */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');

export const projectTeamMemberSchema = z.object({
  userId: objectIdSchema,
  label: z.string().trim().max(60).optional(),
});
export type ProjectTeamMember = z.infer<typeof projectTeamMemberSchema>;

export const projectRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  lotCount: z.number(),
  startDate: z.string().nullable(),
  targetDate: z.string().nullable(),
  coordinatorName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectRow = z.infer<typeof projectRowSchema>;

/** Rolled-up lot/item progress for the project detail header. */
export const projectProgressSchema = z.object({
  lotsTotal: z.number(),
  lotsByStage: z.array(z.object({ stage: z.string(), count: z.number() })),
  totalItems: z.number(),
  selectedItems: z.number(),
  digitizedItems: z.number(),
  taggedItems: z.number(),
});
export type ProjectProgress = z.infer<typeof projectProgressSchema>;

/** Slim project chip for the lot detail page. */
export const lotProjectSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});
export type LotProject = z.infer<typeof lotProjectSchema>;

/* --------------------------------------------------------------------- list */

export const projectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const projectListResponseSchema = z.object({
  rows: z.array(projectRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

/* -------------------------------------------------------------------- create */

export const projectCreateBodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  coordinatorId: objectIdSchema.optional(),
  team: z.array(projectTeamMemberSchema).max(50).default([]),
  startDate: z.string().datetime({ offset: true }).optional(),
  targetDate: z.string().datetime({ offset: true }).optional(),
});
export type ProjectCreateBody = z.infer<typeof projectCreateBodySchema>;
/** Route handlers receive the pre-default input; the server normalises it. */
export type ProjectCreateInput = z.input<typeof projectCreateBodySchema>;

export const projectCreateResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
});
export type ProjectCreateResponse = z.infer<typeof projectCreateResponseSchema>;

/* -------------------------------------------------------------------- update */

export const projectUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  coordinatorId: objectIdSchema.nullable().optional(),
  team: z.array(projectTeamMemberSchema).max(50).optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  targetDate: z.string().datetime({ offset: true }).nullable().optional(),
});
export type ProjectUpdateBody = z.infer<typeof projectUpdateBodySchema>;

export const projectUpdateResponseSchema = projectRowSchema;
export type ProjectUpdateResponse = z.infer<typeof projectUpdateResponseSchema>;

/* -------------------------------------------------------------------- detail */

export const projectDetailQuerySchema = z.object({
  lotPage: z.coerce.number().int().min(1).default(1),
  lotPageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ProjectDetailQuery = z.infer<typeof projectDetailQuerySchema>;

export const projectDetailResponseSchema = z.object({
  project: projectRowSchema.extend({
    coordinatorId: z.string().nullable(),
    team: z.array(
      z.object({
        userId: z.string(),
        userName: z.string(),
        label: z.string().nullable(),
      }),
    ),
  }),
  progress: projectProgressSchema,
  /** Member lots, paginated — same rows as the intake register. */
  lots: lotListResponseSchema,
  recentActivity: z.array(activityEntrySchema),
});
export type ProjectDetailResponse = z.infer<typeof projectDetailResponseSchema>;

/* ------------------------------------------------- membership (assign/unassign) */

export const projectAssignBodySchema = z.object({
  lotId: objectIdSchema,
});
export type ProjectAssignBody = z.infer<typeof projectAssignBodySchema>;

export const projectAssignResponseSchema = z.object({
  projectId: z.string(),
  lotId: z.string(),
  lotCount: z.number(),
});
export type ProjectAssignResponse = z.infer<typeof projectAssignResponseSchema>;

export const lotProjectsResponseSchema = z.object({
  projects: z.array(lotProjectSchema),
});
export type LotProjectsResponse = z.infer<typeof lotProjectsResponseSchema>;

/* ------------------------------------------------------- manual item creation */

export const itemCreateBodySchema = z.object({
  /**
   * Target group within the lot. Omitted = append to the last group, rolling
   * to a new group when the last one is full (36 items, intake convention).
   */
  groupNo: z.number().int().min(1).optional(),
  selectedForDigitization: z.boolean().default(true),
  notDigitizedReason: z.string().trim().max(120).optional(),
  fileName: z.string().trim().max(255).optional(),
});
export type ItemCreateBody = z.infer<typeof itemCreateBodySchema>;

export const itemCreateResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  groupNo: z.number(),
  itemNo: z.number(),
});
export type ItemCreateResponse = z.infer<typeof itemCreateResponseSchema>;
/** Route handlers receive the pre-default input; the server normalises it. */
export type ItemCreateInput = z.input<typeof itemCreateBodySchema>;
