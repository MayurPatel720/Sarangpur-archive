'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError, tasksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  FORMATS,
  FORMAT_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '@/lib/domain';
import { todayIso } from '@/lib/format';
import { useMe } from '@/hooks/useCan';
import { useUserPicker } from '@/hooks/useUserPicker';
import { useUrlPagination } from '@/lib/useUrlPagination';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Field, GhostButton, Select, TextInput } from '@/components/ui/Form';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { AssignTaskDialog } from '@/components/tasks/AssignTaskDialog';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';

const FILTER_KEYS = ['format', 'assignee', 'status', 'priority', 'due', 'lot', 'project', 'q'] as const;

const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'none', label: 'No due date' },
] as const;

/**
 * The full Tasks page. Filters live in the URL (deep-linkable from the dashboard panel
 * and the notification bell): format, assignee, status, priority, due bucket, linked
 * lot / project, text search. Non-admins are confined to their own tasks by the server;
 * the assignee filter is shown to admins only.
 */
export function TasksManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const me = useMe();
  const users = useUserPicker();
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(25);
  const [assigning, setAssigning] = useState(false);

  const grants = me.data?.grants;
  const canView = grants?.includes('task:view') ?? false;
  const canAssign = grants?.includes('task:assign') ?? false;
  const isAdmin = grants?.includes('task:viewAll') ?? false;

  const filters: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = searchParams.get(k);
    if (v) filters[k] = v;
  }
  const openId = searchParams.get('task');

  const patchUrl = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const setFilter = (key: string, value: string) =>
    patchUrl((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      p.delete('page');
    });

  // Free text is debounced into the URL so each keystroke is not a request.
  const [text, setText] = useState(filters.q ?? '');
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (text.trim() !== (searchParams.get('q') ?? '')) setFilter('q', text.trim());
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const params: Record<string, string> = {
    ...filters,
    page: String(page),
    pageSize: String(pageSize),
    today: todayIso(),
  };
  const list = useQuery({
    queryKey: queryKeys.tasks.list(JSON.stringify(params)),
    queryFn: () => tasksApi.list(params),
    enabled: canView,
    placeholderData: (prev) => prev,
  });

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Tasks" />
        <div className="p-4 flex flex-col gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </Panel>
    );
  }
  if (!canView) {
    return (
      <Panel>
        <ErrorState message="You don't have access to tasks." hint="Ask an admin for the task:view permission." />
      </Panel>
    );
  }

  const totalPages = list.data ? totalPagesOf(list.data.total, list.data.pageSize) : 1;
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">Tasks</h1>
          <p className="m-0 text-[12.5px] text-ink-3">
            {list.data
              ? `${list.data.total} ${list.data.total === 1 ? 'task' : 'tasks'}${isAdmin ? '' : ' assigned to or set by you'}.`
              : 'Daily work, assigned and closed by the team.'}
          </p>
        </div>
        {canAssign ? (
          <div className="sm:ml-auto">
            <button
              type="button"
              onClick={() => setAssigning(true)}
              className="inline-flex items-center justify-center h-10 px-4 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[13px] font-semibold cursor-pointer"
            >
              Assign task
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-surface border border-line rounded-[8px] p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Field label="Search">
          <TextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Title, lot, project, person…"
            aria-label="Search tasks"
          />
        </Field>
        <Field label="Format">
          <Select value={filters.format ?? ''} onChange={(e) => setFilter('format', e.target.value)} aria-label="Format">
            <option value="">All formats</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
        {isAdmin ? (
          <Field label="Assignee">
            <Select
              value={filters.assignee ?? ''}
              onChange={(e) => setFilter('assignee', e.target.value)}
              aria-label="Assignee"
            >
              <option value="">Everyone</option>
              <option value="me">Me</option>
              {(users.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Status">
          <Select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={filters.priority ?? ''}
            onChange={(e) => setFilter('priority', e.target.value)}
            aria-label="Priority"
          >
            <option value="">Any priority</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due">
          <Select value={filters.due ?? ''} onChange={(e) => setFilter('due', e.target.value)} aria-label="Due date">
            <option value="">Any date</option>
            {DUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {filters.lot || filters.project ? (
          <div className="flex items-end gap-2 flex-wrap sm:col-span-2 lg:col-span-3 xl:col-span-6">
            {filters.lot ? (
              <GhostButton type="button" className="h-8 !px-2.5 text-[12px]" onClick={() => setFilter('lot', '')}>
                Linked lot filter ✕
              </GhostButton>
            ) : null}
            {filters.project ? (
              <GhostButton type="button" className="h-8 !px-2.5 text-[12px]" onClick={() => setFilter('project', '')}>
                Linked project filter ✕
              </GhostButton>
            ) : null}
          </div>
        ) : null}
        {hasFilters ? (
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <GhostButton
              type="button"
              className="h-8 !px-2.5 text-[12px]"
              onClick={() => {
                setText('');
                patchUrl((p) => {
                  for (const k of FILTER_KEYS) p.delete(k);
                  p.delete('page');
                });
              }}
            >
              Clear filters
            </GhostButton>
          </div>
        ) : null}
      </div>

      <Panel className="overflow-hidden">
        {list.isError ? (
          <ErrorState
            message={list.error instanceof ApiRequestError ? list.error.message : 'Could not load tasks.'}
            hint={list.error instanceof ApiRequestError ? list.error.hint : undefined}
            onRetry={() => void list.refetch()}
          />
        ) : !list.data ? (
          <div className="flex flex-col gap-3 p-4" aria-label="Loading tasks">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[52px] w-full" />
            ))}
          </div>
        ) : list.data.rows.length === 0 ? (
          <p className="m-0 px-4 py-10 text-center text-[13px] font-medium text-ink-3">
            {hasFilters ? 'No tasks match these filters.' : 'No tasks yet.'}
          </p>
        ) : (
          list.data.rows.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              showAssignee
              onOpen={(id) => patchUrl((p) => p.set('task', id))}
            />
          ))
        )}
        {list.data ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={list.data.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="tasks"
          />
        ) : null}
      </Panel>

      {openId ? <TaskDrawer taskId={openId} onClose={() => patchUrl((p) => p.delete('task'))} /> : null}
      {assigning ? (
        <AssignTaskDialog
          defaultFormat={FORMATS.find((f) => f === filters.format)}
          onClose={() => setAssigning(false)}
          onCreated={(id) => patchUrl((p) => p.set('task', id))}
        />
      ) : null}
    </div>
  );
}
