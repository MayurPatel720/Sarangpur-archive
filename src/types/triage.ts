import { z } from 'zod';
import { decisionResponseSchema } from './lot';

/**
 * Decision triage (AG Grid) contracts. The lot-level decision model is
 * unchanged — one verdict, one stage transition — so the bulk save answers the
 * same lot facts as `decisionBodySchema`, plus per-group significance (OR-ed
 * server-side into `significanceFlags`) and a keep/drop verdict per item.
 * The bulk response reuses `decisionResponseSchema` verbatim.
 */

/** GET /api/lots/[lotId]/triage — every item at once, subtype labels resolved. */
export const triageItemSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    groupNo: z.number(),
    itemNo: z.number(),
    /** Position in the lot's `mediaLines` array. 0 for pre-lines items. */
    lineIndex: z.number(),
    subtype: z.string(),
    subtypeLabel: z.string(),
    selectedForDigitization: z.boolean(),
    notDigitizedReason: z.string().nullable(),
    digitized: z.boolean(),
    taggedInMls: z.boolean(),
  })
  .strict();
export type TriageItem = z.output<typeof triageItemSchema>;

export const triageItemsResponseSchema = z
  .object({
    items: z.array(triageItemSchema),
    total: z.number(),
    /** Lot `__v` — the client drafts against this and discards stale drafts. */
    version: z.number(),
  })
  .strict();
export type TriageItemsResponse = z.output<typeof triageItemsResponseSchema>;

/**
 * POST /api/lots/[lotId]/decision/triage. Item ids must all belong to the
 * lot; every dropped item needs a reason (active `notDigitizedReason` value).
 */
export const triageBulkBodySchema = z
  .object({
    existsInMls: z.boolean(),
    /** Required when existsInMls — is this copy better than the MLS one? */
    newCopyIsBetter: z.boolean().optional(),
    mlsMatchPaths: z.array(z.string().trim().max(500)).max(50).default([]),
    conditionUsable: z.boolean(),
    /** Required when !conditionUsable — stored on the audit entry. */
    conditionIssue: z.string().trim().max(2000).optional(),
    /** Significance per media sub-type group; OR-ed into one lot-level array. */
    groupFlags: z
      .array(
        z.object({
          lineIndex: z.number().int().min(0),
          /** One answer per active `significance` question, in list order. */
          flags: z.array(z.boolean()).min(1).max(24),
        }),
      )
      .max(20),
    notes: z.string().trim().max(2000).optional(),
    disposition: z.enum(['return', 'discard']).optional(),
    /** Required when disposition is discard (brief §3.08). */
    discardReason: z.string().trim().min(1).max(40).optional(),
    discardNotes: z.string().trim().max(2000).optional(),
    items: z
      .array(
        z.object({
          id: z.string(),
          selected: z.boolean(),
          reason: z.string().trim().min(1).max(40).nullable().default(null),
        }),
      )
      .min(1)
      .max(20000),
  })
  .superRefine((b, ctx) => {
    if (b.existsInMls && b.newCopyIsBetter === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'State whether this copy is better — the lot already exists in MLS.',
        path: ['newCopyIsBetter'],
      });
    }
    if (!b.conditionUsable && !b.conditionIssue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Describe the condition issue — condition was marked unusable.',
        path: ['conditionIssue'],
      });
    }
    if (b.disposition === 'discard' && !b.discardReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a discard reason.',
        path: ['discardReason'],
      });
    }
    if (b.items.some((it) => !it.selected && !it.reason)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Give a reason for every dropped item.',
        path: ['items'],
      });
    }
  });
export type TriageBulkBody = z.input<typeof triageBulkBodySchema>;

/** POST /api/lots/[lotId]/decision/triage — same shape as recording a decision. */
export const triageBulkResponseSchema = decisionResponseSchema;
export type TriageBulkResponse = z.output<typeof triageBulkResponseSchema>;
