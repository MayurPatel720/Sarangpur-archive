/**
 * Every React Query cache key in one place, so an invalidation after a mutation can
 * never miss a consumer because someone typed the key slightly differently.
 */
export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    blocks: () => [...queryKeys.dashboard.all, 'blocks'] as const,
    summary: (format?: string) =>
      [...queryKeys.dashboard.all, 'summary', format ?? 'all'] as const,
    pipeline: (format?: string) =>
      [...queryKeys.dashboard.all, 'pipeline', format ?? 'all'] as const,
    alerts: (format?: string) =>
      [...queryKeys.dashboard.all, 'alerts', format ?? 'all'] as const,
    activity: (limit: number, format?: string) =>
      [...queryKeys.dashboard.all, 'activity', limit, format ?? 'all'] as const,
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
    usersPicker: () => [...queryKeys.session.all, 'users', 'picker'] as const,
  },
  lots: {
    all: ['lots'] as const,
    list: (params: string) => [...queryKeys.lots.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.lots.all, 'detail', id] as const,
    items: (id: string, params: string) => [...queryKeys.lots.all, 'items', id, params] as const,
    activity: (id: string, page: number, pageSize: number) =>
      [...queryKeys.lots.all, 'activity', id, page, pageSize] as const,
    triage: (id: string) => [...queryKeys.lots.all, 'triage', id] as const,
    itemsGrid: (id: string) => [...queryKeys.lots.all, 'items-grid', id] as const,
  },
  queues: {
    all: ['queues'] as const,
    itemDispositions: (kind: string, status: string, page: number, pageSize: number) =>
      ['queues', 'item-dispositions', kind, status, page, pageSize] as const,
    returns: (page: number, pageSize: number, format?: string) =>
      [...queryKeys.queues.all, 'returns', page, pageSize, format ?? 'all'] as const,
    discards: (page: number, pageSize: number, format?: string) =>
      [...queryKeys.queues.all, 'discards', page, pageSize, format ?? 'all'] as const,
  },
  search: {
    all: ['search'] as const,
    query: (params: string) => [...queryKeys.search.all, 'query', params] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: (params: string) => [...queryKeys.projects.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.projects.all, 'detail', id] as const,
    lotProjects: (lotId: string) =>
      [...queryKeys.projects.all, 'lot-projects', lotId] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (params: string) => [...queryKeys.tasks.all, 'list', params] as const,
    panel: (params: string) => [...queryKeys.tasks.all, 'panel', params] as const,
    detail: (id: string) => [...queryKeys.tasks.all, 'detail', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (page: number) => [...queryKeys.notifications.all, 'list', page] as const,
  },
} as const;
