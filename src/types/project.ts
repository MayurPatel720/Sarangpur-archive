import { z } from 'zod';
import { activityEntrySchema } from './dashboard';
import {
  MAX_REFERENCE_PEOPLE,
  contactSchema,
  lotListResponseSchema,
  lotRowSchema,
  mediaLineInputSchema,
  referencePersonSchema,
  rightsSchema,
} from './lot';
import { MAX_ASSIGNEES, isoDaySchema, taskFormatSchema, taskPrioritySchema } from './task';

/**
 * Project contracts (Module: projects).
 *
 * Wire rule, same as lots: writes carry ISO datetimes with offset and plain
 * id strings; responses echo ISO strings. `code` is admin-typed free text —
 * the server only enforces presence + uniqueness.
 */

/* ------------------------------------------------------------------ shared */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');

/**
 * Intake data shared by a project and ALL of its synced child lots — one value,
 * edited anywhere, updated everywhere. Dates travel as ISO datetimes with offset.
 * Media lines, file path and label flags are per-lot and deliberately not here.
 */
const sharedFields = {
  dateReceived: z.string().datetime({ offset: true }),
  originSource: z.string().trim().min(1).max(40),
  owner: contactSchema,
  pointsOfContact: z.array(contactSchema).max(5),
  referencePeople: z.array(referencePersonSchema).max(MAX_REFERENCE_PEOPLE),
  facilitator: contactSchema,
  conditionNotes: z.string().trim().max(2000),
  conditionPhotoUrl: z.string().trim().min(1).max(500),
  reasonForSending: z.string().trim().max(1000),
  senderRemarks: z.string().trim().max(2000),
  photoDate: z.string().trim().max(80),
  photoLocation: z.string().trim().max(200),
  photoEvent: z.string().trim().max(200),
  peopleInPhoto: z.string().trim().max(1000),
  returnRequested: z.boolean(),
  returnFormat: z.string().trim().min(1).max(40),
  returnDuration: z.string().trim().max(200),
  returnDueAt: z.string().datetime({ offset: true }),
  rights: rightsSchema,
} as const;
export const SHARED_KEYS = Object.keys(sharedFields) as (keyof typeof sharedFields)[];

/** Create-time shape: every key optional. */
export const projectSharedSchema = z.object({
  dateReceived: sharedFields.dateReceived.optional(),
  originSource: sharedFields.originSource.optional(),
  owner: sharedFields.owner.optional(),
  pointsOfContact: sharedFields.pointsOfContact.optional(),
  referencePeople: sharedFields.referencePeople.optional(),
  facilitator: sharedFields.facilitator.nullable().optional(),
  conditionNotes: sharedFields.conditionNotes.optional(),
  conditionPhotoUrl: sharedFields.conditionPhotoUrl.optional(),
  reasonForSending: sharedFields.reasonForSending.optional(),
  senderRemarks: sharedFields.senderRemarks.optional(),
  photoDate: sharedFields.photoDate.optional(),
  photoLocation: sharedFields.photoLocation.optional(),
  photoEvent: sharedFields.photoEvent.optional(),
  peopleInPhoto: sharedFields.peopleInPhoto.optional(),
  returnRequested: sharedFields.returnRequested.optional(),
  returnFormat: sharedFields.returnFormat.optional(),
  returnDuration: sharedFields.returnDuration.optional(),
  returnDueAt: sharedFields.returnDueAt.optional(),
  rights: sharedFields.rights.optional(),
});
export type ProjectShared = z.infer<typeof projectSharedSchema>;

/** Patch shape: a key set to null clears that shared value. */
export const projectSharedPatchSchema = z.object({
  dateReceived: sharedFields.dateReceived.nullable().optional(),
  originSource: sharedFields.originSource.nullable().optional(),
  owner: sharedFields.owner.nullable().optional(),
  pointsOfContact: sharedFields.pointsOfContact.nullable().optional(),
  referencePeople: sharedFields.referencePeople.nullable().optional(),
  facilitator: sharedFields.facilitator.nullable().optional(),
  conditionNotes: sharedFields.conditionNotes.nullable().optional(),
  conditionPhotoUrl: sharedFields.conditionPhotoUrl.nullable().optional(),
  reasonForSending: sharedFields.reasonForSending.nullable().optional(),
  senderRemarks: sharedFields.senderRemarks.nullable().optional(),
  photoDate: sharedFields.photoDate.nullable().optional(),
  photoLocation: sharedFields.photoLocation.nullable().optional(),
  photoEvent: sharedFields.photoEvent.nullable().optional(),
  peopleInPhoto: sharedFields.peopleInPhoto.nullable().optional(),
  returnRequested: sharedFields.returnRequested.nullable().optional(),
  returnFormat: sharedFields.returnFormat.nullable().optional(),
  returnDuration: sharedFields.returnDuration.nullable().optional(),
  returnDueAt: sharedFields.returnDueAt.nullable().optional(),
  rights: sharedFields.rights.nullable().optional(),
});
export type ProjectSharedPatch = z.infer<typeof projectSharedPatchSchema>;

/** One child-lot assignment from the wizard's last step (one lot per format). */
export const projectAssignmentSchema = z.object({
  format: z.string().trim().min(1).max(40),
  assigneeId: objectIdSchema.nullable().optional(),
});
export type ProjectAssignment = z.infer<typeof projectAssignmentSchema>;

/**
 * One task created alongside a project's child lot (one per format, at most). The
 * server fills in the title (`<Format> lot — <project name>`) and links the task to the
 * new lot, the project and the format — none of those travel on the wire. Needs the
 * `task:assign` grant (403 otherwise); users without it send plain `assignments`.
 */
export const projectTaskInputSchema = z.object({
  format: taskFormatSchema,
  description: z.string().trim().max(2000).optional(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  priority: taskPrioritySchema.default('normal'),
  dueDate: isoDaySchema.optional(),
  /** 1–20 active users; duplicates are dropped. */
  assigneeIds: z.array(objectIdSchema).min(1, 'Pick at least one assignee.').max(MAX_ASSIGNEES),
});
export type ProjectTaskInput = z.input<typeof projectTaskInputSchema>;
export type ProjectTaskBody = z.infer<typeof projectTaskInputSchema>;

export const projectRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  lotCount: z.number(),
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
  /** Only projects where this user is the assignee of at least one child lot ("My lots"). */
  assignee: objectIdSchema.optional(),
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

export const projectCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).optional(),
    coordinatorId: objectIdSchema.optional(),
    /** Intake details every child lot will share. All optional — assignees fill gaps later. */
    shared: projectSharedSchema.default({}),
    /** Mandatory: the quantities. One child lot is created per distinct format. */
    mediaLines: z
      .array(mediaLineInputSchema)
      .min(1, 'Add at least one media line.')
      .max(20, 'No more than 20 media lines.'),
    /** Per-format assignee. A format with no entry (or null) starts unassigned (admin-only). */
    assignments: z.array(projectAssignmentSchema).max(20).default([]),
    /** Optional per-format tasks, created in the same transaction as the project and its lots. */
    tasks: z.array(projectTaskInputSchema).max(20).default([]),
    /** The caller's local calendar day, used to reject past due dates. Defaults to the server's UTC day. */
    today: isoDaySchema.optional(),
  })
  .refine((b) => b.mediaLines.reduce((sum, l) => sum + l.quantity, 0) <= 20000, {
    message: 'Total quantity across media lines cannot exceed 20000.',
    path: ['mediaLines'],
  });
export type ProjectCreateBody = z.infer<typeof projectCreateBodySchema>;
/** Route handlers receive the pre-default input; the server normalises it. */
export type ProjectCreateInput = z.input<typeof projectCreateBodySchema>;

export const projectCreateResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  lots: z.array(z.object({ id: z.string(), lotReference: z.string(), format: z.string() })),
  tasks: z.array(z.object({ id: z.string(), format: z.string() })),
});
export type ProjectCreateResponse = z.infer<typeof projectCreateResponseSchema>;

/* -------------------------------------------------------------------- update */

export const projectUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  coordinatorId: objectIdSchema.nullable().optional(),
  /** Shared intake values — applied to the project AND every synced child lot. */
  shared: projectSharedPatchSchema.optional(),
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

/**
 * One member lot on the project page: the register row plus the per-lot columns the
 * project table needs. All values are denormalised lot counters (no item scan, no join).
 */
export const projectLotRowSchema = lotRowSchema.extend({
  assigneeId: z.string().nullable(),
  /** Media breakdown, one entry per sub-type line (falls back to the lot's primary line). */
  mediaLines: z.array(z.object({ mediaSubtype: z.string(), quantity: z.number() })),
  /** Files found on disk / files expected (digitization counters). */
  scanned: z.number(),
  scanTarget: z.number(),
  /** Items tagged in MLS, of `quantity`. */
  tagged: z.number(),
});
export type ProjectLotRow = z.infer<typeof projectLotRowSchema>;

export const projectDetailResponseSchema = z.object({
  project: projectRowSchema.extend({
    coordinatorId: z.string().nullable(),
    /** Who created the project (looked up by id at read time; null if the user is gone). */
    createdByName: z.string().nullable(),
    shared: projectSharedSchema,
    /** Derived: distinct assignees of the project's lots. */
    team: z.array(z.object({ userId: z.string(), userName: z.string(), lotCount: z.number() })),
    /** Formats present, with the lot each one lives in — for "add media" and reassigning. */
    lotsByFormat: z.array(
      z.object({
        lotId: z.string(),
        lotReference: z.string(),
        format: z.string(),
        quantity: z.number(),
        assigneeId: z.string().nullable(),
        assigneeName: z.string().nullable(),
      }),
    ),
    /** Intake fields still empty across the whole project. */
    missing: z.array(z.string()),
  }),
  progress: projectProgressSchema,
  /** Member lots, paginated — same rows as the intake register. */
  lots: lotListResponseSchema.extend({ rows: z.array(projectLotRowSchema) }),
  recentActivity: z.array(activityEntrySchema),
});
export type ProjectDetailResponse = z.infer<typeof projectDetailResponseSchema>;

/* ------------------------------------------------- membership (assign/unassign) */

export const projectAssignBodySchema = z.object({
  lotId: objectIdSchema,
  /** Optional: who owns the lot once it joins (a synced lot with no assignee is admin-only). */
  assigneeId: objectIdSchema.optional(),
});

/** Admin adds more media to a project later (new format → new child lot). */
export const projectAddMediaBodySchema = z.object({
  mediaLines: z.array(mediaLineInputSchema).min(1).max(20),
  assignments: z.array(projectAssignmentSchema).max(20).default([]),
  /** Only for NEW formats (a format that already has a lot cannot be assigned again). */
  tasks: z.array(projectTaskInputSchema).max(20).default([]),
  today: isoDaySchema.optional(),
});
export type ProjectAddMediaBody = z.infer<typeof projectAddMediaBodySchema>;
export type ProjectAddMediaInput = z.input<typeof projectAddMediaBodySchema>;

/** PUT /api/lots/[lotId]/assignee — null clears the assignee. */
export const lotAssigneeBodySchema = z.object({ assigneeId: objectIdSchema.nullable() });
export type LotAssigneeBody = z.infer<typeof lotAssigneeBodySchema>;
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
