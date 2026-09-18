/**
 * Every React Query cache key in one place, so an invalidation after a mutation can
 * never miss a consumer because someone typed the key slightly differently.
 */
export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
    pipeline: () => [...queryKeys.dashboard.all, 'pipeline'] as const,
    alerts: () => [...queryKeys.dashboard.all, 'alerts'] as const,
    activity: (limit: number) => [...queryKeys.dashboard.all, 'activity', limit] as const,
  },
  health: {
    all: ['health'] as const,
    server: () => [...queryKeys.health.all, 'server'] as const,
  },
} as const;
