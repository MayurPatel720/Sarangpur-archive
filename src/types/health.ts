import { z } from 'zod';

export const serverHealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'down']),
  server: z.string(),
  latencyMs: z.number(),
  dbName: z.string(),
});
export type ServerHealthResponse = z.infer<typeof serverHealthResponseSchema>;
