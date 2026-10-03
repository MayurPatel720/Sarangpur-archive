import { z } from 'zod';
import { decisionResponseSchema } from './lot';

/**
 * Items grid contracts (the lot's Items tab, AG Grid). One row per physical item;
 * the assignee fills in details and answers the per-item decision questions.
 * Yes/No answers are three-state on the wire: true / false / null (unanswered).
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');

export const gridItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  groupNo: z.number(),
  itemNo: z.number(),
  lineIndex: z.number(),
  format: z.string(),
  subtypeLabel: z.string(),

  name: z.string().nullable(),
  nameOnCase: z.string().nullable(),
  description: z.string().nullable(),
  year: z.number().nullable(),
  month: z.string().nullable(),
  place: z.string().nullable(),
  event: z.string().nullable(),
  people: z.string().nullable(),
  physicalSource: z.string().nullable(),
  itemCondition: z.string().nullable(),
  remarks: z.string().nullable(),

  existsInMls: z.boolean().nullable(),
  newCopyIsBetter: z.boolean().nullable(),
  conditionUsable: z.boolean().nullable(),
  significant: z.boolean().nullable(),
  /** Server-computed; null until every required question is answered. */
  verdict: z.enum(['archive', 'return_or_discard']).nullable(),
  disposition: z.enum(['return', 'discard']).nullable(),
  reason: z.string().nullable(),
  /** archive | return | discard once final; null while undecided. */
  result: z.enum(['archive', 'return', 'discard']).nullable(),
  dispositionStatus: z.enum(['pending', 'done']).nullable(),

  captureStatus: z.enum(['not_started', 'captured', 'missing']),
  digitalSource: z.string().nullable(),
  fileName: z.string().nullable(),
  taggedInMls: z.boolean(),
  mlsDuplicateOf: z.string().nullable(),
});
export type GridItem = z.output<typeof gridItemSchema>;

export const itemsSummarySchema = z.object({
  total: z.number(),
  named: z.number(),
  decided: z.number(),
  archive: z.number(),
  return: z.number(),
  discard: z.number(),
});
export type ItemsSummary = z.output<typeof itemsSummarySchema>;

export const itemsGridResponseSchema = z.object({
  items: z.array(gridItemSchema),
  summary: itemsSummarySchema,
  /** Lot `__v` at read time. */
  version: z.number(),
  stage: z.string(),
  /** What the CURRENT user may change (assignee rule + stage locks). */
  editable: z.object({ details: z.boolean(), decision: z.boolean() }),
  /** Why the lot can't move on yet, when every item is decided but something blocks it. */
  blockedBy: z.array(z.string()),
});
export type ItemsGridResponse = z.output<typeof itemsGridResponseSchema>;

/**
 * PATCH /api/lots/[lotId]/items/grid — set the same values on one or many items.
 * Every key is optional; `null` clears. Text fields are trimmed; empty → null.
 */
const text = (max: number) => z.string().trim().max(max).nullable().optional();
export const itemsBulkBodySchema = z.object({
  itemIds: z.array(objectIdSchema).min(1).max(20000),
  set: z
    .object({
      name: text(300),
      nameOnCase: text(300),
      description: text(4000),
      year: z.number().int().min(1800).max(2200).nullable().optional(),
      month: text(20),
      place: text(200),
      event: text(300),
      people: text(1000),
      physicalSource: text(60),
      itemCondition: text(60),
      remarks: text(2000),
      existsInMls: z.boolean().nullable().optional(),
      newCopyIsBetter: z.boolean().nullable().optional(),
      conditionUsable: z.boolean().nullable().optional(),
      significant: z.boolean().nullable().optional(),
      disposition: z.enum(['return', 'discard']).nullable().optional(),
      reason: text(60),
    })
    .refine((s) => Object.keys(s).length > 0, { message: 'Nothing to change.' }),
});
export type ItemsBulkBody = z.input<typeof itemsBulkBodySchema>;
export type ItemsBulkSet = NonNullable<ItemsBulkBody['set']>;

export const itemsBulkResponseSchema = z.object({
  updated: z.number(),
  summary: itemsSummarySchema,
  /** Set when this save decided the last item and the lot moved on. */
  finalized: decisionResponseSchema.nullable(),
  blockedBy: z.array(z.string()),
});
export type ItemsBulkResponse = z.output<typeof itemsBulkResponseSchema>;

/* ------------------------------------------- item return / discard queues */

export const itemDispositionQuerySchema = z.object({
  kind: z.enum(['return', 'discard']),
  status: z.enum(['pending', 'done']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ItemDispositionQuery = z.output<typeof itemDispositionQuerySchema>;

export const itemDispositionRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string().nullable(),
  lotId: z.string(),
  lotReference: z.string(),
  reason: z.string().nullable(),
  decidedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  doneByName: z.string().nullable(),
});
export const itemDispositionListSchema = z.object({
  rows: z.array(itemDispositionRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ItemDispositionList = z.output<typeof itemDispositionListSchema>;

/** POST /api/items/dispositions — mark item returns/discards as done. */
export const itemDispositionDoneBodySchema = z.object({
  kind: z.enum(['return', 'discard']),
  itemIds: z.array(objectIdSchema).min(1).max(1000),
});
export type ItemDispositionDoneBody = z.input<typeof itemDispositionDoneBodySchema>;
export const itemDispositionDoneResponseSchema = z.object({ updated: z.number() });
