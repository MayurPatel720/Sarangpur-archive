import { z } from 'zod';

/** A sheet a person can save a layout for: `items` (a lot's Items sheet) or `master:<format>` / `master:all`. */
export const layoutScopeSchema = z.string().regex(/^[a-z0-9:_-]{1,40}$/, 'Unknown sheet.');

/** The layout itself: a small bag of column order / pins / widths / hidden columns (at most ~20 KB). */
const layoutDataSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 20_000, { message: 'The layout is too large.' });

export const layoutQuerySchema = z.object({ scope: layoutScopeSchema });
export const layoutResponseSchema = z.object({ layout: z.record(z.string(), z.unknown()).nullable() });
export type LayoutResponse = z.output<typeof layoutResponseSchema>;

/** PUT /api/me/layouts — `layout: null` forgets the saved layout (back to the default). */
export const layoutSaveBodySchema = z.object({ scope: layoutScopeSchema, layout: layoutDataSchema.nullable() });
export type LayoutSaveBody = z.input<typeof layoutSaveBodySchema>;
