'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, todosApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { MAX_OPEN_TODOS, QUADRANTS, flagsOf, type QuadrantId } from '@/lib/todo';
import { useCan } from '@/hooks/useCan';
import { IconPlus } from '@/components/ui/icons';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { GhostButton, PrimaryButton, Select } from '@/components/ui/Form';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { AssignTaskDialog } from '@/components/tasks/AssignTaskDialog';
import type { Todo, TodoCreateBody, TodoListQuery, TodoPatchBody } from '@/types/todo';
import { TodoDialog } from './TodoDialog';
import { TodoMatrix, type TodoActions } from './TodoMatrix';
import { TodoTable } from './TodoTable';

type View = 'matrix' | 'table';
const VIEW_KEY = 'archive.todos.view';

/**
 * My to-do: a private Eisenhower-matrix list. One screen, two views — the four-tile Matrix and
 * a sortable Table — switched from the top and remembered per browser. Only the signed-in user's
 * own to-dos are ever loaded (the server enforces it).
 */
export function TodoManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canDelegate = useCan('task:assign');

  // The view, the status tabs and the quadrant filter are kept in the URL (?view=table&status=done&quadrant=do),
  // so a reload or a shared link opens the same screen.
  const search = useSearchParams();
  const urlView = search.get('view');
  const [view, setViewState] = useState<View>(urlView === 'table' || urlView === 'matrix' ? urlView : 'matrix');
  useEffect(() => {
    if (urlView === 'table' || urlView === 'matrix') return; // the link wins over the remembered choice
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'matrix' || saved === 'table') setViewState(saved);
    } catch {
      /* storage blocked — the default view is fine */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // Table-only controls.
  const urlStatus = search.get('status');
  const urlQuadrant = search.get('quadrant');
  const [status, setStatus] = useState<TodoListQuery['status']>(urlStatus === 'done' || urlStatus === 'all' ? urlStatus : 'open');
  const [quadrant, setQuadrant] = useState<QuadrantId | ''>(QUADRANTS.some((q) => q.id === urlQuadrant) ? (urlQuadrant as QuadrantId) : '');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k));
    put('view', view === 'matrix' ? null : view);
    put('status', view === 'table' && status !== 'open' ? status : null);
    put('quadrant', view === 'table' && quadrant ? quadrant : null);
    const next = q.toString();
    if (next !== window.location.search.replace(/^\?/, '')) window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname);
  }, [view, status, quadrant]);
  const [sort, setSort] = useState<TodoListQuery['sort']>('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [dialog, setDialog] = useState<{ todo?: Todo; quadrant?: QuadrantId } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [delegating, setDelegating] = useState<Todo | null>(null);
  const [dropping, setDropping] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState<Todo | null>(null);

  // The matrix shows every open to-do (the server caps a list at MAX_OPEN_TODOS); the table pages.
  const params = useMemo(
    () =>
      view === 'matrix'
        ? { status: 'open' as const, pageSize: MAX_OPEN_TODOS, sort: 'created' as const, dir: 'desc' as const }
        : { status, ...(quadrant ? { quadrant } : {}), sort, dir, page, pageSize },
    [view, status, quadrant, sort, dir, page, pageSize],
  );
  const list = useQuery({
    queryKey: queryKeys.todos.list(JSON.stringify(params)),
    queryFn: () => todosApi.list(params),
    placeholderData: keepPreviousData,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
  const fail = (title: string) => (e: unknown) => toast.error(title, e instanceof ApiRequestError ? e.message : undefined);

  const create = useMutation({
    mutationFn: (b: TodoCreateBody) => todosApi.create(b),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
    onError: (e) => {
      setDialogError(e instanceof ApiRequestError ? e.message : 'Could not add the to-do.');
      fail('Could not add the to-do')(e);
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: TodoPatchBody }) => todosApi.update(v.id, v.body),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
    onError: (e) => {
      setDialogError(e instanceof ApiRequestError ? e.message : 'Could not save the to-do.');
      fail('Could not save the to-do')(e);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => todosApi.remove(id),
    onSuccess: () => {
      setDropping(null);
      setDeleting(null);
      setDialog(null);
      refresh();
    },
    onError: fail('Could not delete the to-do'),
  });

  const busy = create.isPending || update.isPending || remove.isPending;

  const actions: TodoActions = {
    busy,
    canDelegate,
    onToggleDone: (t) => update.mutate({ id: t.id, body: { done: !t.done } }),
    onEdit: (t) => {
      setDialogError(null);
      setDialog({ todo: t });
    },
    onMove: (t, q) => update.mutate({ id: t.id, body: flagsOf(q) }),
    onQuickAdd: (title, q) => create.mutate({ title, ...flagsOf(q) }),
    onDelegate: setDelegating,
    onDrop: setDropping,
  };

  const data = list.data;
  const counts = data?.counts ?? { do: 0, schedule: 0, delegate: 0, delete: 0 };
  const onSort = (key: TodoListQuery['sort']) => {
    if (key === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir(key === 'created' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const viewButton = (v: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={`min-h-[30px] cursor-pointer rounded-[6px] border-0 px-3.5 text-[12.5px] font-semibold transition-colors ${
        view === v ? 'bg-surface text-ink shadow-control' : 'bg-transparent text-ink-3 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="m-0 text-balance text-[20px] font-semibold tracking-[-0.022em] text-ink sm:text-[24px]">My to-do</h1>
          <p className="m-0 mt-0.5 text-[13px] text-ink-3">
            Private to you.{data ? <> <span className="font-semibold tabular-nums text-ink-2">{data.openTotal}</span> open</> : null}
          </p>
        </div>
        <div role="group" aria-label="View" className="inline-flex gap-0.5 rounded-[8px] border border-line bg-surface-sunken p-0.5 sm:ml-auto">
          {viewButton('matrix', 'Matrix')}
          {viewButton('table', 'Table')}
        </div>
        <PrimaryButton
          onClick={() => {
            setDialogError(null);
            setDialog({});
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconPlus size={15} />
            Add to-do
          </span>
        </PrimaryButton>
      </div>

      {view === 'table' ? (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Show" className="inline-flex gap-0.5 rounded-[8px] border border-line bg-surface-sunken p-0.5">
            {(['open', 'done', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`min-h-[28px] cursor-pointer rounded-[6px] border-0 px-3 text-[12px] font-semibold transition-colors ${
                  status === s ? 'bg-surface text-ink shadow-control' : 'bg-transparent text-ink-3 hover:text-ink'
                }`}
              >
                {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'All'}
              </button>
            ))}
          </div>
          <Select
            value={quadrant}
            onChange={(e) => {
              setQuadrant(e.target.value as QuadrantId | '');
              setPage(1);
            }}
            aria-label="Filter by quadrant"
            className="!h-8 !w-auto !text-[12px]"
          >
            <option value="">All quadrants</option>
            {QUADRANTS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </Select>
          {quadrant || status !== 'open' ? (
            <GhostButton
              onClick={() => {
                setQuadrant('');
                setStatus('open');
                setPage(1);
              }}
            >
              Clear filters
            </GhostButton>
          ) : null}
        </div>
      ) : null}

      {list.isError ? (
        <Panel>
          <ErrorState
            message={list.error instanceof ApiRequestError ? list.error.message : "Couldn't load your to-dos."}
            onRetry={() => void list.refetch()}
          />
        </Panel>
      ) : !data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Loading to-dos">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[220px] w-full" />
          ))}
        </div>
      ) : view === 'matrix' ? (
        <TodoMatrix rows={data.rows} counts={counts} actions={actions} />
      ) : (
        <Panel>
          {data.rows.length === 0 ? (
            <p className="m-0 px-4 py-8 text-center text-[13px] font-medium text-ink-3">
              {status === 'done' ? 'Nothing finished yet.' : 'No to-dos match. Add one to get started.'}
            </p>
          ) : (
            <TodoTable rows={data.rows} sort={sort} dir={dir} onSort={onSort} actions={actions} />
          )}
          {data.total > 0 ? (
            <Pagination
              page={page}
              totalPages={totalPagesOf(data.total, pageSize)}
              total={data.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              label="to-dos"
            />
          ) : null}
        </Panel>
      )}

      {dialog ? (
        <TodoDialog
          todo={dialog.todo}
          defaultQuadrant={dialog.quadrant}
          pending={create.isPending || update.isPending}
          error={dialogError}
          onSave={(body) => (dialog.todo ? update.mutate({ id: dialog.todo.id, body: { ...body, note: body.note ?? null, dueDate: body.dueDate ?? null } }) : create.mutate(body))}
          onDelete={dialog.todo ? () => setDeleting(dialog.todo!) : undefined}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {delegating ? (
        <AssignTaskDialog
          defaultTitle={delegating.title}
          defaultDescription={delegating.note ?? undefined}
          onClose={() => setDelegating(null)}
          onCreated={(taskId) => update.mutate({ id: delegating.id, body: { delegatedTaskId: taskId } })}
        />
      ) : null}

      {dropping ? (
        <ConfirmDialog
          title="Drop this to-do?"
          body={`“${dropping.title}” will be removed from your list for good.`}
          confirmLabel="Drop it"
          pending={remove.isPending}
          onConfirm={() => remove.mutate(dropping.id)}
          onClose={() => setDropping(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this to-do?"
          body={`“${deleting.title}” will be removed from your list for good.`}
          confirmLabel="Delete"
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
