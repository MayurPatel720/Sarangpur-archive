'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { todayIso } from '@/lib/format';
import { TASK_OPEN_STATUSES } from '@/lib/domain';
import type { TaskRow } from '@/types/task';

export interface ProjectTaskCounts {
  open: number;
  overdue: number;
  done: number;
}

/**
 * Tasks linked to one project. One request (the first 100, server-filtered by project and
 * by the caller's visibility) feeds both the KPI tile and the Tasks card, so they share a
 * cache entry. Counts are over the fetched rows; `total` is the server's true count.
 */
export function useProjectTasks(projectId: string, enabled: boolean) {
  const params = { project: projectId, page: '1', pageSize: '100', today: todayIso() };
  const query = useQuery({
    queryKey: queryKeys.tasks.list(JSON.stringify(params)),
    queryFn: () => tasksApi.list(params),
    enabled,
  });

  const derived = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const counts: ProjectTaskCounts = {
      open: rows.filter((t) => (TASK_OPEN_STATUSES as string[]).includes(t.status)).length,
      overdue: rows.filter((t) => t.overdue).length,
      done: rows.filter((t) => t.status === 'done').length,
    };
    // Overdue first, then other open work (soonest due first), then finished.
    const rank = (t: TaskRow) => (t.overdue ? 0 : (TASK_OPEN_STATUSES as string[]).includes(t.status) ? 1 : 2);
    const sorted = [...rows].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
        b.createdAt.localeCompare(a.createdAt),
    );
    return { counts, sorted };
  }, [query.data]);

  return { query, counts: derived.counts, sorted: derived.sorted };
}
