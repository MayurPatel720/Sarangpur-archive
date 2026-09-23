import { z } from 'zod';
import { DATA_TYPES, DECISIONS, FORMATS, STAGES } from '@/lib/domain';
import { lotRowSchema } from '@/types/lot';

/** Query for GET /api/search — palette + format/stage chips. pageSize capped at 10. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  stage: z.enum(STAGES).optional(),
  decision: z.enum(DECISIONS).optional(),
  format: z.enum(FORMATS).optional(),
  dataType: z.enum(DATA_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10).default(10),
});
export type SearchQuery = z.output<typeof searchQuerySchema>;

export const matchedItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  fileName: z.string().nullable(),
});

export const searchRowSchema = lotRowSchema.extend({
  matchedVia: z.enum(['lot', 'item', 'both']),
  matchedItems: z.array(matchedItemSchema).max(5),
});

export const searchResponseSchema = z.object({
  rows: z.array(searchRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type SearchResponse = z.output<typeof searchResponseSchema>;
