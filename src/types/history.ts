import { z } from 'zod';

/** Version history of a lot's Excel (see src/lib/item-history.ts and src/server/lots/history.ts). */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected an ObjectId string.');

export const historyCellSchema = z.object({ path: z.string(), from: z.string(), to: z.string() });
export const historyChangeSchema = z.object({
  itemId: z.string(),
  code: z.string().nullable(),
  /** The cells that differ (a few; `item` = the row was added / removed). */
  cells: z.array(historyCellSchema),
});
export type HistoryChange = z.output<typeof historyChangeSchema>;

export const historyChangeSetSchema = z.object({
  id: z.string(),
  seq: z.number(),
  at: z.string(),
  kind: z.string(),
  label: z.string(),
  itemCount: z.number(),
  cellCount: z.number(),
  undone: z.boolean(),
  actorName: z.string(),
});

export const historySessionSchema = z.object({
  id: z.string(),
  actorName: z.string(),
  from: z.string(),
  to: z.string(),
  itemCount: z.number(),
  cellCount: z.number(),
  /** Every change of the session has been undone. */
  undone: z.boolean(),
  /** Newest first. */
  sets: z.array(historyChangeSetSchema),
});

export const historyVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  seq: z.number(),
  at: z.string(),
  byName: z.string().nullable(),
  auto: z.boolean(),
});

/** GET /api/lots/[lotId]/history */
export const historyListResponseSchema = z.object({
  headSeq: z.number(),
  sessions: z.array(historySessionSchema),
  versions: z.array(historyVersionSchema),
  /** What the toolbar's Undo / Redo act on for the caller (null = nothing to do). */
  canUndo: z.object({ id: z.string(), label: z.string() }).nullable(),
  canRedo: z.object({ id: z.string(), label: z.string() }).nullable(),
});
export type HistoryListResponse = z.output<typeof historyListResponseSchema>;

/** GET /api/lots/[lotId]/history/changes/[changeSetId] — the cells one change set touched. */
export const historyChangeDetailSchema = z.object({
  id: z.string(),
  label: z.string(),
  changes: z.array(historyChangeSchema),
  truncated: z.boolean(),
});
export type HistoryChangeDetail = z.output<typeof historyChangeDetailSchema>;

/** GET /api/lots/[lotId]/history/preview?seq|versionId — what a restore would change ("Compare"). */
export const historyPreviewSchema = z.object({
  name: z.string(),
  seq: z.number(),
  itemCount: z.number(),
  cellCount: z.number(),
  truncated: z.boolean(),
  /** The restore would also reopen the lot's decision. */
  reopensDecision: z.boolean(),
  changes: z.array(historyChangeSchema),
});
export type HistoryPreview = z.output<typeof historyPreviewSchema>;

export const historyPreviewQuerySchema = z.object({
  seq: z.coerce.number().int().min(0).optional(),
  versionId: objectId.optional(),
});

/** GET /api/lots/[lotId]/history/item?itemId|code&path — every recorded change of one item or cell. */
export const historyItemQuerySchema = z.object({
  itemId: objectId.optional(),
  code: z.string().trim().max(80).optional(),
  path: z.string().trim().max(80).optional(),
});
export const historyItemResponseSchema = z.object({
  code: z.string().nullable(),
  entries: z.array(
    z.object({
      seq: z.number(),
      at: z.string(),
      actorName: z.string(),
      label: z.string(),
      kind: z.string(),
      undone: z.boolean(),
      cells: z.array(historyCellSchema),
    }),
  ),
});
export type HistoryItemResponse = z.output<typeof historyItemResponseSchema>;

export const historyConflictSchema = z.object({
  itemId: z.string(),
  code: z.string().nullable(),
  /** The fields somebody changed since (`item` = the row itself was added / removed). */
  paths: z.array(z.string()),
});
export type HistoryConflict = z.output<typeof historyConflictSchema>;

/** POST /api/lots/[lotId]/history */
export const historyActionBodySchema = z.discriminatedUnion('action', [
  /** Undo a change set (default: the caller's latest). */
  z.object({ action: z.literal('undo'), changeSetId: objectId.optional(), skipConflicts: z.boolean().optional() }),
  z.object({ action: z.literal('redo'), skipConflicts: z.boolean().optional() }),
  z.object({ action: z.literal('undoSession'), sessionId: z.string().min(1).max(40), skipConflicts: z.boolean().optional() }),
  /** Put the sheet back to a saved version or to a point in history (always saved as a new change). */
  z.object({
    action: z.literal('restore'),
    versionId: objectId.optional(),
    seq: z.number().int().min(0).optional(),
    skipConflicts: z.boolean().optional(),
  }),
  z.object({ action: z.literal('saveVersion'), name: z.string().trim().min(1, 'Give the version a name.').max(120), skipConflicts: z.boolean().optional() }),
]);
export type HistoryActionBody = z.input<typeof historyActionBodySchema>;

export const historyActionResponseSchema = z.object({
  /** False when conflicts stopped it (nothing was changed): offer "Undo the rest". */
  done: z.boolean(),
  applied: z.number(),
  conflicts: z.array(historyConflictSchema),
  notes: z.array(z.string()),
  label: z.string(),
});
export type HistoryActionResponse = z.output<typeof historyActionResponseSchema>;
