import { z } from 'zod';
import { DEPT_IDS } from '@/lib/item-columns';

/**
 * Items grid contracts (the lot's Items tab — the lot's Excel, AG Grid). One row per
 * physical item. Columns are grouped into four departments (src/lib/item-columns.ts).
 * Yes/No answers are three-state on the wire: true / false / null (unanswered).
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');

export const customColumnTypeSchema = z.enum(['text', 'number', 'yesno', 'date']);
export const customColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: customColumnTypeSchema,
  dept: z.enum(DEPT_IDS),
});

export const customValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const gridItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  groupNo: z.number(),
  itemNo: z.number(),
  lineIndex: z.number(),
  sortOrder: z.number(),
  format: z.string(),
  dataType: z.string(),
  subtypeLabel: z.string(),

  // Details
  senderCode: z.string().nullable(),
  /** `dd/mm/yyyy` or `dd/mm/yyyy - dd/mm/yyyy`; '' when not set. */
  dateRange: z.string(),
  place: z.string().nullable(),
  nameOnTape: z.string().nullable(),
  nameOnCase: z.string().nullable(),
  physicalSource: z.string().nullable(),
  remarks: z.string().nullable(),
  /** The original this item duplicates (set together with the D-kind code). */
  duplicateCode: z.string().nullable(),
  /** Codes of items (any lot) that are duplicates of THIS item — worked out on read, never stored here. */
  duplicatedBy: z.array(z.string()),

  // Decision
  digital: z.boolean().nullable(),
  redigital: z.boolean().nullable(),
  discard: z.boolean().nullable(),
  decisionRemark: z.string().nullable(),
  /**
   * `archive` = digitize (digital or redigital = Yes), `discard` = discard only,
   * `physical` = keep the physical item only; null until digital, redigital and discard are all answered.
   */
  result: z.enum(['archive', 'discard', 'physical']).nullable(),

  // Digitalization & Storage
  captured: z.boolean(),
  digitalSource: z.string().nullable(),
  fileName: z.string().nullable(),
  phyStorageLoc: z.string().nullable(),
  /** The physical item's final fate. */
  disposition: z.enum(['return', 'discard']).nullable(),
  dispositionStatus: z.enum(['pending', 'done']).nullable(),
  taggedInMls: z.boolean(),
  storageRemark: z.string().nullable(),

  // Logging
  logged: z.boolean(),
  /** `dd/mm/yyyy`; '' when not set. */
  loggedAt: z.string(),
  loggerName: z.string().nullable(),

  custom: z.record(z.string(), customValueSchema),
});
export type GridItem = z.output<typeof gridItemSchema>;

export const itemsSummarySchema = z.object({
  total: z.number(),
  decided: z.number(),
  /** Items to digitize (digital or redigital = Yes). */
  archive: z.number(),
  /** Items marked discard only. */
  discard: z.number(),
  /** Items kept as physical only. */
  physical: z.number(),
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
  /** The lot's own Excel setup — shared by everyone who opens this lot. */
  hiddenColumns: z.array(z.string()),
  customColumns: z.array(customColumnSchema),
});
export type ItemsGridResponse = z.output<typeof itemsGridResponseSchema>;

/**
 * PATCH /api/lots/[lotId]/items/grid — set the same values on one or many items.
 * Every key is optional; `null` clears. Text fields are trimmed; empty → null.
 */
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const tri = z.boolean().nullable().optional();
export const itemsBulkBodySchema = z.object({
  itemIds: z.array(objectIdSchema).min(1).max(20000),
  set: z
    .object({
      senderCode: text(100),
      /** `dd/mm/yyyy` or `dd/mm/yyyy - dd/mm/yyyy` (also `mm/yyyy`, `yyyy`). */
      dateRange: text(60),
      place: text(300),
      nameOnTape: text(300),
      nameOnCase: text(300),
      physicalSource: text(60),
      remarks: text(2000),
      digital: tri,
      redigital: tri,
      discard: tri,
      decisionRemark: text(2000),
      captured: z.boolean().optional(),
      digitalSource: text(200),
      fileName: text(1000),
      phyStorageLoc: text(300),
      disposition: z.enum(['return', 'discard']).nullable().optional(),
      taggedInMls: z.boolean().optional(),
      storageRemark: text(2000),
      logged: z.boolean().optional(),
      /** `dd/mm/yyyy`. */
      loggedAt: text(20),
      loggerName: text(200),
      /** Values of the lot's custom columns, by column key. */
      custom: z.record(z.string().max(40), customValueSchema).optional(),
    })
    .refine((s) => Object.keys(s).length > 0, { message: 'Nothing to change.' }),
});
export type ItemsBulkBody = z.input<typeof itemsBulkBodySchema>;
export type ItemsBulkSet = NonNullable<ItemsBulkBody['set']>;

export const itemsBulkResponseSchema = z.object({
  updated: z.number(),
  summary: itemsSummarySchema,
  /** Set when this save decided the last item and the lot moved on. */
  finalized: z
    .object({ decision: z.string(), stage: z.string() })
    .nullable(),
  blockedBy: z.array(z.string()),
});
export type ItemsBulkResponse = z.output<typeof itemsBulkResponseSchema>;

/* ------------------------------------------------------- item codes (popup) */

/** GET …/items/codes?abbr1&abbr2 — what number would the next item of this pair get. */
export const codeInfoQuerySchema = z.object({
  abbr1: z.string().trim().min(1).max(12),
  abbr2: z.string().trim().min(1).max(12),
});
export const codeInfoResponseSchema = z.object({
  /** Highest number in use for the pair across all lots, 0 when unused. */
  highest: z.number(),
  /** The number a sheet re-coded to this pair would start at by default. */
  nextNo: z.number(),
});
export type CodeInfoResponse = z.output<typeof codeInfoResponseSchema>;

/** PATCH …/items/codes — re-code one sheet (one media line): both abbreviations + the starting number. */
export const sheetCodeBodySchema = z.object({
  lineIndex: z.number().int().min(0),
  abbr1: z.string().trim().min(1).max(12),
  abbr2: z.string().trim().min(1).max(12),
  /** First item's number; the rest continue from it. Omit to continue after the highest in use. */
  startNo: z.number().int().min(1).max(9_999_999).optional(),
});
export type SheetCodeBody = z.input<typeof sheetCodeBodySchema>;
export const sheetCodeResponseSchema = z.object({
  updated: z.number(),
  firstCode: z.string(),
  lastCode: z.string(),
});
export type SheetCodeResponse = z.output<typeof sheetCodeResponseSchema>;

/** PATCH …/items/code — change ONE item's number to a free one (abbreviations stay). */
export const itemNumberBodySchema = z.object({
  itemId: objectIdSchema,
  no: z.number().int().min(1).max(9_999_999),
});
export type ItemNumberBody = z.input<typeof itemNumberBodySchema>;
export const itemNumberResponseSchema = z.object({ code: z.string() });

/* --------------------------------------------------------------- duplicates */

/**
 * POST …/items/duplicate — mark an item as a duplicate of an original (any lot).
 * `confirm: false` returns the plan (who is main, what the duplicate's new code will be)
 * so the user can swap before anything is written; `confirm: true` applies it.
 * `swap` makes THIS item the main one and the other the duplicate.
 */
export const itemDuplicateBodySchema = z.object({
  itemId: objectIdSchema,
  otherCode: z.string().trim().min(1).max(60),
  swap: z.boolean().default(false),
  confirm: z.boolean().default(false),
});
export type ItemDuplicateBody = z.input<typeof itemDuplicateBodySchema>;

const duplicateSideSchema = z.object({
  itemId: z.string(),
  code: z.string(),
  lotId: z.string(),
  lotReference: z.string(),
  /** This side's lot is the one open in the grid. */
  here: z.boolean(),
});
export const itemDuplicateResponseSchema = z.object({
  applied: z.boolean(),
  main: duplicateSideSchema,
  duplicate: duplicateSideSchema.extend({ newCode: z.string() }),
  /** Why the swap cannot be applied by this user (e.g. no right to edit the other lot). */
  blocked: z.string().nullable(),
});
export type ItemDuplicateResponse = z.output<typeof itemDuplicateResponseSchema>;

/* -------------------------------------------------------------- row order */

/** PATCH …/items/order — new order of ONE sheet's rows, top to bottom. */
export const itemOrderBodySchema = z.object({
  lineIndex: z.number().int().min(0),
  orderedIds: z.array(objectIdSchema).min(1).max(20000),
});
export type ItemOrderBody = z.input<typeof itemOrderBodySchema>;
export const itemOrderResponseSchema = z.object({ updated: z.number() });

/* ------------------------------------------------------ columns (hide / add) */

/** PATCH …/items/columns — change the lot's Excel setup. Every key optional. */
export const columnsBodySchema = z
  .object({
    hidden: z.array(z.string().max(40)).max(200).optional(),
    add: z
      .object({
        label: z.string().trim().min(1).max(60),
        type: customColumnTypeSchema,
        dept: z.enum(DEPT_IDS),
      })
      .optional(),
    removeKey: z.string().max(40).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export type ColumnsBody = z.input<typeof columnsBodySchema>;
export const columnsResponseSchema = z.object({
  hiddenColumns: z.array(z.string()),
  customColumns: z.array(customColumnSchema),
});
export type ColumnsResponse = z.output<typeof columnsResponseSchema>;

/* ------------------------------------------------------------ Excel import */

/** POST …/items/import — rows read from an uploaded .xlsx. `apply: false` only previews. */
export const importBodySchema = z.object({
  apply: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        /** Archive code of the row. */
        code: z.string().trim().min(1).max(60),
        /** `"<department>|<column name>"` → cell text. Blank cells are left out. */
        cells: z.record(z.string().max(120), z.string().max(4000)),
      }),
    )
    .min(1)
    .max(20000),
});
export type ImportBody = z.input<typeof importBodySchema>;
export const importResponseSchema = z.object({
  applied: z.boolean(),
  /** Rows whose code matched an item of this lot. */
  matched: z.number(),
  /** Rows that would change (or did change) at least one cell. */
  willChange: z.number(),
  unknownCodes: z.array(z.string()),
  /** First changes, for the preview table. */
  changes: z.array(z.object({ code: z.string(), column: z.string(), from: z.string(), to: z.string() })),
  changesTotal: z.number(),
  errors: z.array(z.object({ code: z.string(), column: z.string(), message: z.string() })),
  ignoredColumns: z.array(z.string()),
  blockedBy: z.array(z.string()),
});
export type ImportResponse = z.output<typeof importResponseSchema>;

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
  place: z.string().nullable(),
  lotId: z.string(),
  lotReference: z.string(),
  /** Digitize-first items can only be returned/discarded once their file is captured. */
  waitingForCapture: z.boolean(),
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
