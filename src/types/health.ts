import { z } from 'zod';

export const serverHealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'down']),
  server: z.string(),
  latencyMs: z.number(),
  dbName: z.string(),
  storage: z.object({
    label: z.string(),
    root: z.string(),
    usedTb: z.number(),
    capacityTb: z.number(),
    // Real indexed bytes from FileIndex — honest "what we have catalogued" figure.
    // Full-volume truth needs the storage-inventory job (not built yet).
    indexedBytes: z.number(),
    indexedFiles: z.number(),
  }),
});
export type ServerHealthResponse = z.infer<typeof serverHealthResponseSchema>;
