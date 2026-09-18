import { z } from 'zod';
import { ACTIVITY_KINDS, STAGES } from '@/lib/domain';

/**
 * The wire contract between the API routes and the React Query hooks.
 *
 * Each route parses its own response with these schemas before returning it, so a bad
 * aggregation result fails loudly on the server instead of rendering as NaN in the UI.
 * The client infers its types from the same schemas, which is the whole reason the
 * backend is TypeScript.
 */

export const severitySchema = z.enum(['neutral', 'info', 'good', 'warning', 'critical']);
export type Severity = z.infer<typeof severitySchema>;

/* ------------------------------------------------------------------ summary */

export const kpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  /** Pre-formatted secondary line, e.g. "9 past the 5-day threshold". */
  note: z.string(),
  noteSeverity: severitySchema,
});

export const summaryResponseSchema = z.object({
  generatedAt: z.string(),
  kpis: z.array(kpiSchema),
  storage: z.object({
    usedTb: z.number(),
    capacityTb: z.number(),
    percent: z.number(),
  }),
  activeLotCount: z.number(),
  totalLotCount: z.number(),
});
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
export type Kpi = z.infer<typeof kpiSchema>;

/* ----------------------------------------------------------------- pipeline */

export const pipelineSampleSchema = z.object({
  id: z.string(),
  code: z.string(),
  note: z.string(),
  noteSeverity: severitySchema,
  progressPercent: z.number().nullable(),
});

export const pipelineStageSchema = z.object({
  stage: z.enum(STAGES),
  label: z.string(),
  count: z.number(),
  accent: severitySchema,
  samples: z.array(pipelineSampleSchema),
});

export const pipelineResponseSchema = z.object({
  totalActive: z.number(),
  stages: z.array(pipelineStageSchema),
});
export type PipelineResponse = z.infer<typeof pipelineResponseSchema>;
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

/* ------------------------------------------------------------------- alerts */

export const alertSchema = z.object({
  key: z.string(),
  title: z.string(),
  detail: z.string(),
  count: z.number(),
  severity: severitySchema,
  href: z.string(),
});

export const alertsResponseSchema = z.object({
  totalOpen: z.number(),
  alerts: z.array(alertSchema),
});
export type AlertsResponse = z.infer<typeof alertsResponseSchema>;
export type Alert = z.infer<typeof alertSchema>;

/* ----------------------------------------------------------------- activity */

export const activityEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(ACTIVITY_KINDS),
  title: z.string(),
  detail: z.string(),
  lotCode: z.string(),
  actorName: z.string(),
  at: z.string(),
  severity: severitySchema,
});

export const activityResponseSchema = z.object({
  entries: z.array(activityEntrySchema),
});
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

/* -------------------------------------------------------------------- error */

export const apiErrorSchema = z.object({
  error: z.string(),
  hint: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
