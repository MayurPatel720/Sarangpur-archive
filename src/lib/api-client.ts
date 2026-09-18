import type { ZodType } from 'zod';
import {
  activityResponseSchema,
  alertsResponseSchema,
  pipelineResponseSchema,
  summaryResponseSchema,
  type ActivityResponse,
  type AlertsResponse,
  type PipelineResponse,
  type SummaryResponse,
} from '@/types/dashboard';

/**
 * Thrown when a route returns a non-2xx. Carries the server's own message so the UI
 * can show "Cannot reach MongoDB…" rather than a generic failure.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.hint = hint;
  }
}

async function getJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    let hint: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; hint?: string };
      if (body.error) message = body.error;
      hint = body.hint;
    } catch {
      /* the body was not JSON — keep the status message */
    }
    throw new ApiRequestError(res.status, message, hint);
  }

  // Parsing on the client too is cheap and turns a backend contract change into a
  // clear error here rather than an undefined deep inside a component.
  return schema.parse(await res.json());
}

export const dashboardApi = {
  summary: () => getJson<SummaryResponse>('/api/dashboard/summary', summaryResponseSchema),
  pipeline: () => getJson<PipelineResponse>('/api/dashboard/pipeline', pipelineResponseSchema),
  alerts: () => getJson<AlertsResponse>('/api/dashboard/alerts', alertsResponseSchema),
  activity: (limit = 8) =>
    getJson<ActivityResponse>(`/api/dashboard/activity?limit=${limit}`, activityResponseSchema),
};
