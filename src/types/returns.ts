import { z } from 'zod';

/**
 * Returns screen contracts. A return is either a WHOLE LOT (lot-level return status) or a
 * handful of ITEMS from a lot that was otherwise archived. Either way it ends with a
 * handover that records who received the material and how.
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');

/** Who received the material. */
export const recipientSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  place: z.string().nullable(),
});
export type Recipient = z.infer<typeof recipientSchema>;

/** A contact on the lot that can pre-fill the receiver form. */
export const returnContactSchema = z.object({
  role: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
});
export type ReturnContact = z.infer<typeof returnContactSchema>;

/* ------------------------------------------------------------------- to return */

export const returnItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string().nullable(),
  /** Must be digitalized before the physical copy can go back. */
  waiting: z.boolean(),
});

export const returnCardSchema = z.object({
  /** Stable key: the lot id. */
  key: z.string(),
  lotId: z.string(),
  lotReference: z.string(),
  namingCode: z.string().nullable(),
  ownerName: z.string(),
  format: z.string(),
  /** True = the whole lot goes back; false = only the listed items. */
  wholeLot: z.boolean(),
  itemCount: z.number(),
  /** Pending items (item returns). Empty for a whole-lot return. */
  items: z.array(returnItemSchema),
  /** Items that still need digitalizing first. */
  waitingCount: z.number(),
  dueAt: z.string().nullable(),
  overdue: z.boolean(),
  /** Whole days until due (negative = overdue); null without a due date. */
  daysToDue: z.number().nullable(),
  /** physical | digital | both, as the owner asked. */
  requestedFormat: z.string().nullable(),
  durationText: z.string().nullable(),
  assigneeName: z.string().nullable(),
  contacts: z.array(returnContactSchema),
});
export type ReturnCard = z.output<typeof returnCardSchema>;

/* -------------------------------------------------------------------- returned */

export const returnedRowSchema = z.object({
  key: z.string(),
  lotId: z.string(),
  lotReference: z.string(),
  ownerName: z.string(),
  scope: z.enum(['lot', 'items']),
  count: z.number(),
  /** A few item codes for an item return. */
  itemCodes: z.array(z.string()),
  recipient: recipientSchema.nullable(),
  method: z.string().nullable(),
  trackingReference: z.string().nullable(),
  notes: z.string().nullable(),
  returnedAt: z.string().nullable(),
  byName: z.string().nullable(),
});
export type ReturnedRow = z.output<typeof returnedRowSchema>;

/* ------------------------------------------------------------------------ list */

export const returnsQuerySchema = z.object({
  tab: z.enum(['todo', 'done']).default('todo'),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** The caller's local calendar day, for "overdue". */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ReturnsQuery = z.output<typeof returnsQuerySchema>;

export const returnsSummarySchema = z.object({
  lotsToReturn: z.number(),
  itemsToReturn: z.number(),
  overdue: z.number(),
  dueSoon: z.number(),
  returnedLast30Days: z.number(),
});
export type ReturnsSummary = z.output<typeof returnsSummarySchema>;

export const returnsResponseSchema = z.object({
  tab: z.enum(['todo', 'done']),
  cards: z.array(returnCardSchema),
  returned: z.array(returnedRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  summary: returnsSummarySchema,
  can: z.object({ record: z.boolean() }),
});
export type ReturnsResponse = z.output<typeof returnsResponseSchema>;

/* ---------------------------------------------------------------------- record */

/** Methods that need a postal address — a place is then required. */
export const SHIPPED_METHODS = ['post', 'courier'];

export const recipientInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter the name of the person receiving it.').max(120),
  email: z.string().trim().email('That email address is not valid.').max(160).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()\-\s.]{5,40}$/, 'Enter a valid phone number.')
    .optional()
    .or(z.literal('')),
  place: z.string().trim().max(400).optional(),
});
export type RecipientInput = z.input<typeof recipientInputSchema>;

export const returnRecordBodySchema = z
  .object({
    lotId: objectIdSchema,
    scope: z.enum(['lot', 'items']),
    /** Required for `items`: which pending items are in this handover. */
    itemIds: z.array(objectIdSchema).min(1).max(2000).optional(),
    recipient: recipientInputSchema,
    method: z.string().trim().max(200).optional(),
    trackingReference: z.string().trim().max(120).optional(),
    /** Calendar day of the handover, `YYYY-MM-DD`. Defaults to today. */
    returnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.scope === 'items' && (!b.itemIds || b.itemIds.length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['itemIds'], message: 'Choose the items being handed over.' });
    }
    if (!b.recipient.phone && !b.recipient.email) {
      ctx.addIssue({ code: 'custom', path: ['recipient', 'phone'], message: 'Add a phone number or an email so the receiver can be reached.' });
    }
    if (b.method && SHIPPED_METHODS.includes(b.method.toLowerCase()) && !b.recipient.place?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['recipient', 'place'], message: `Add the address — it is being sent by ${b.method.toLowerCase()}.` });
    }
  });
export type ReturnRecordBody = z.input<typeof returnRecordBodySchema>;

export const returnRecordResponseSchema = z.object({
  lotReference: z.string(),
  returned: z.number(),
  /** True when this handover finished the lot (it moved to Returned). */
  lotFinished: z.boolean(),
});
export type ReturnRecordResponse = z.output<typeof returnRecordResponseSchema>;
