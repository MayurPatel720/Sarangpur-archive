import { z } from 'zod';

/**
 * Operation-write contracts (API.md §5). Vocabulary fields (`scanStatus`,
 * `returnFormat`, `returnStatus`, `discardReason`, …) are plain strings validated
 * against admin-managed reference lists on the write path (`assertActive*`).
 */

/** PATCH /api/lots/[lotId]/scan — volunteer+. Records who scanned, where the files live. */
export const scanBodySchema = z
  .object({
    scanStatus: z.string().trim().min(1).max(40),
    scanDate: z.string().datetime({ offset: true }).optional(),
    folderPath: z.string().trim().min(1).max(500).optional(),
    /** Caller-supplied __v — stale writes get 409. */
    version: z.number().int().min(0),
  })
  .strict();
export type ScanBody = z.infer<typeof scanBodySchema>;

export const scanResponseSchema = z
  .object({
    id: z.string(),
    lotReference: z.string(),
    stage: z.string(),
    scanStatus: z.string(),
    version: z.number(),
  })
  .strict();
export type ScanResponse = z.infer<typeof scanResponseSchema>;

/**
 * POST /api/lots/[lotId]/reconcile — volunteer+. Diffs selected items against
 * the FileIndex (the walker fills it; no BullMQ yet, so this runs inline and
 * returns 200 with counts — never a fake 202).
 */
export const reconcileResponseSchema = z
  .object({
    id: z.string(),
    lotReference: z.string(),
    stage: z.string(),
    scanStatus: z.string(),
    expected: z.number(),
    found: z.number(),
    /** Capped at 100 codes; the full list lives in the audit detail. */
    missing: z.array(z.string()),
    missingTotal: z.number(),
    unexpectedTotal: z.number(),
    version: z.number(),
  })
  .strict();
export type ReconcileResponse = z.infer<typeof reconcileResponseSchema>;

/** PATCH /api/lots/[lotId]/mls — reviewer+. Manual tagging v1 (Module 0 decision). */
export const mlsBodySchema = z
  .object({
    recordId: z.string().trim().min(1).max(120).optional(),
    taggedCount: z.number().int().min(0).optional(),
    tagsApplied: z.string().trim().max(2000).nullable().optional(),
    dataListAttached: z.boolean().optional(),
    /** Advance mls_tag → storage when the tagging pass is finished. */
    markComplete: z.boolean().optional(),
    version: z.number().int().min(0),
  })
  .strict()
  .refine(
    (b) =>
      b.recordId !== undefined ||
      b.taggedCount !== undefined ||
      b.tagsApplied !== undefined ||
      b.dataListAttached !== undefined,
    {
      message: 'Nothing to change: pass recordId, taggedCount, tagsApplied, or dataListAttached.',
    },
  );
export type MlsBody = z.infer<typeof mlsBodySchema>;

export const mlsResponseSchema = z
  .object({
    id: z.string(),
    lotReference: z.string(),
    stage: z.string(),
    taggedCount: z.number(),
    outboxPending: z.number(),
    version: z.number(),
  })
  .strict();
export type MlsResponse = z.infer<typeof mlsResponseSchema>;

/** PATCH /api/lots/[lotId]/mls/duplicate — lead_reviewer+. */
export const duplicateBodySchema = z
  .object({
    duplicateAction: z.string().trim().min(1).max(40),
    version: z.number().int().min(0),
  })
  .strict();
export type DuplicateBody = z.infer<typeof duplicateBodySchema>;

export const duplicateResponseSchema = z
  .object({
    id: z.string(),
    lotReference: z.string(),
    duplicateAction: z.string(),
    outboxPending: z.number(),
    version: z.number(),
  })
  .strict();
export type DuplicateResponse = z.infer<typeof duplicateResponseSchema>;

/** PATCH /api/lots/[lotId]/return — volunteer+ (`return:manage`). */
export const returnBodySchema = z
  .object({
    requested: z.boolean().optional(),
    format: z.string().trim().min(1).max(40).optional(),
    durationText: z.string().trim().max(200).optional().nullable(),
    dueAt: z.string().datetime({ offset: true }).optional().nullable(),
    status: z.string().trim().min(1).max(40).optional(),
    method: z.string().trim().max(200).optional().nullable(),
    trackingReference: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    version: z.number().int().min(0),
  })
  .strict()
  .refine(
    (b) =>
      b.requested !== undefined ||
      b.format !== undefined ||
      b.durationText !== undefined ||
      b.dueAt !== undefined ||
      b.status !== undefined ||
      b.method !== undefined ||
      b.trackingReference !== undefined ||
      b.notes !== undefined,
    { message: 'Nothing to change: pass at least one return field.' },
  );
export type ReturnBody = z.infer<typeof returnBodySchema>;

export const returnResponseSchema = z
  .object({
    id: z.string(),
    lotReference: z.string(),
    stage: z.string(),
    returnStatus: z.string(),
    version: z.number(),
  })
  .strict();
export type ReturnResponse = z.infer<typeof returnResponseSchema>;

/** POST /api/lots/[lotId]/discard — reviewer+ (`discard:confirm`). */
export const discardBodySchema = z
  .object({
    confirm: z.literal(true),
    reason: z.string().trim().min(1).max(40),
    notes: z.string().trim().max(2000).optional(),
    version: z.number().int().min(0),
  })
  .strict();
export type DiscardBody = z.infer<typeof discardBodySchema>;

export const discardResponseSchema = z
  .object({
    id: z.string(),
    lotReference: z.string(),
    stage: z.string(),
    version: z.number(),
  })
  .strict();
export type DiscardResponse = z.infer<typeof discardResponseSchema>;

/** GET /api/lots/[lotId]/items (API.md §5). */
export const itemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  groupNo: z.coerce.number().int().min(1).optional(),
  digitized: z.enum(['true', 'false']).optional(),
  taggedInMls: z.enum(['true', 'false']).optional(),
  mlsDuplicate: z.enum(['true', 'false']).optional(),
});
export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

const lotItemSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    groupNo: z.number(),
    itemNo: z.number(),
    selectedForDigitization: z.boolean(),
    digitized: z.boolean(),
    taggedInMls: z.boolean(),
    mlsDuplicate: z.boolean(),
    mlsDuplicateOf: z.string().nullable(),
  })
  .strict();

export const itemsResponseSchema = z
  .object({
    rows: z.array(lotItemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
  .strict();
export type ItemsResponse = z.infer<typeof itemsResponseSchema>;

/** GET /api/lots/[lotId]/activity — per-record audit trail, newest first. */
export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const activityResponseSchema = z
  .object({
    rows: z.array(
      z
        .object({
          id: z.string(),
          kind: z.string(),
          title: z.string(),
          detail: z.string().nullable(),
          actorName: z.string(),
          at: z.string(),
        })
        .strict(),
    ),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
  .strict();
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
