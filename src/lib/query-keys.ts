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
  admin: {
    all: ['admin'] as const,
    roles: () => [...queryKeys.admin.all, 'roles'] as const,
    lists: () => [...queryKeys.admin.all, 'lists'] as const,
    users: () => [...queryKeys.admin.all, 'users'] as const,
    settings: () => [...queryKeys.admin.all, 'settings'] as const,
  },
  reference: {
    all: ['reference'] as const,
    byKey: (key: string) => [...queryKeys.reference.all, key] as const,
  },
  session: {
    all: ['session'] as const,
    me: () => [...queryKeys.session.all, 'me'] as const,
  },
  lots: {
    all: ['lots'] as const,
    list: (params: string) => [...queryKeys.lots.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.lots.all, 'detail', id] as const,
    items: (id: string, params: string) => [...queryKeys.lots.all, 'items', id, params] as const,
    activity: (id: string, page: number, pageSize: number) =>
      [...queryKeys.lots.all, 'activity', id, page, pageSize] as const,
  },
  queues: {
    all: ['queues'] as const,
    decision: (page: number, pageSize: number) =>
      [...queryKeys.queues.all, 'decision', page, pageSize] as const,
    digitize: (page: number, pageSize: number) =>
      [...queryKeys.queues.all, 'digitize', page, pageSize] as const,
    mls: (page: number, pageSize: number) =>
      [...queryKeys.queues.all, 'mls', page, pageSize] as const,
    returns: (page: number, pageSize: number) =>
      [...queryKeys.queues.all, 'returns', page, pageSize] as const,
    discards: (page: number, pageSize: number) =>
      [...queryKeys.queues.all, 'discards', page, pageSize] as const,
  },
} as const;
