'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, tasksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TASK_OPEN_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from '@/lib/domain';
import { todayIso } from '@/lib/format';
import { useMe } from '@/hooks/useCan';
import { DatePicker } from '@/components/ui/DatePicker';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Field, PrimaryButton, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { TaskDueChip } from '@/components/tasks/TaskDueChip';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import type { TaskRow } from '@/types/task';

/**
 * My to-do — one list for the signed-in user: tasks assigned to them AND private to-dos
 * they add themselves. Every item carries an importance tag (Urgent / Normal / Low) and
 * an optional due date, and is grouped Overdue / Today / Upcoming / No date. Tick the
 * circle to finish; open an item for notes, a checklist and comments with images.
 */

const IMPORTANCE_STYLE: Record<TaskPriority, string> = {
  urgent: 'border-danger-line bg-danger-bg text-danger',
  normal: 'border-line-strong bg-surface text-ink-2',
  low: 'border-line bg-surface-sunken text-ink-3',
};

type Source = 'all' | 'mine' | 'assigned';
type View = 'open' | 'done';

function TodoItem({
  task,
  onOpen,
  onToggle,
  toggling,
}: {
  task: TaskRow;
  onOpen: () => void;
  onToggle: () => void;
  toggling: boolean;
}) {
  const done = task.status === 'done';
  return (
    <li className="flex items-start gap-3 px-3 md:px-4 py-3 border-b border-line-row last:border-b-0 min-w-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        disabled={toggling || task.status === 'cancelled'}
        onClick={onToggle}
        className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer disabled:opacity-50 ${
          done ? 'bg-accent border-accent text-white' : 'bg-surface border-line-strong text-transparent hover:border-accent'
        }`}
      >
        <span aria-hidden className="text-[13px] leading-none">
          ✓
        </span>
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <button
          type="button"
          onClick={onOpen}
          className={`text-left bg-transparent border-0 p-0 cursor-pointer text-[14px] font-semibold hover:underline break-words ${
            done ? 'text-ink-3 line-through' : 'text-ink'
          }`}
        >
          {task.title}
        </button>
        <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap text-[11.5px] text-ink-3">
          <TaskPriorityBadge priority={task.priority} />
          <TaskDueChip dueDate={task.dueDate} overdue={task.overdue} />
          {task.personal ? (
            <span>Personal</span>
          ) : (
            <span>
              From {task.createdByName}
              {task.lotCode ? ' · ' : ''}
              {task.lotId && task.lotCode ? (
                <Link href={`/register/${task.lotId}`} className="text-accent no-underline hover:underline">
                  {task.lotCode}
                </Link>
              ) : null}
            </span>
          )}
          {task.status === 'blocked' ? <span className="text-danger font-medium">Blocked</span> : null}
          {task.status === 'in_progress' ? <span className="font-medium text-ink-2">In progress</span> : null}
          {task.checklistTotal > 0 ? (
            <span className="tabular-nums">
              ☑ {task.checklistDone}/{task.checklistTotal}
            </span>
          ) : null}
          {task.commentCount > 0 ? <span className="tabular-nums">💬 {task.commentCount}</span> : null}
        </div>
      </div>
    </li>
  );
}

function Group({
  title,
  tone,
  tasks,
  render,
}: {
  title: string;
  tone?: 'danger';
  tasks: TaskRow[];
  render: (t: TaskRow) => React.ReactNode;
}) {
  if (tasks.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title={`${title} (${tasks.length})`}>
        {tone === 'danger' ? <span className="ml-1 text-[11px] font-semibold text-danger">Needs attention</span> : null}
      </PanelHeader>
      <ul className="m-0 p-0 list-none">{tasks.map(render)}</ul>
    </Panel>
  );
}

export function TodoManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canView = me.data?.grants.includes('task:view') ?? false;
  const today = todayIso();

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [source, setSource] = useState<Source>('all');
  const [view, setView] = useState<View>('open');
  const [openId, setOpenId] = useState<string | null>(null);

  const params = { assignee: 'me', pageSize: '100', today };
  const list = useQuery({
    queryKey: queryKeys.tasks.list(JSON.stringify({ todo: true, ...params })),
    queryFn: () => tasksApi.list(params),
    enabled: canView,
    placeholderData: (prev) => prev,
  });

  const add = useMutation({
    mutationFn: () =>
      tasksApi.createMine({ title: title.trim(), priority, ...(dueDate ? { dueDate } : {}) }),
    onSuccess: () => {
      setTitle('');
      setDueDate('');
      setPriority('normal');
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
    onError: (e) => toast.error('Could not add the to-do', e instanceof ApiRequestError ? e.message : undefined),
  });

  const toggle = useMutation({
    mutationFn: (t: TaskRow) => tasksApi.setStatus(t.id, { status: t.status === 'done' ? 'todo' : 'done' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
    onError: (e) => toast.error('Could not update the to-do', e instanceof ApiRequestError ? e.message : undefined),
  });

  const rows = useMemo(() => {
    const all = list.data?.rows ?? [];
    return all.filter((t) => (source === 'mine' ? t.personal : source === 'assigned' ? !t.personal : true));
  }, [list.data, source]);

  const open = rows.filter((t) => (TASK_OPEN_STATUSES as string[]).includes(t.status));
  const finished = rows.filter((t) => t.status === 'done');
  const byDue = (a: TaskRow, b: TaskRow) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  const urgentFirst = (a: TaskRow, b: TaskRow) =>
    TASK_PRIORITIES.indexOf(a.priority) - TASK_PRIORITIES.indexOf(b.priority) || byDue(a, b);
  const overdue = open.filter((t) => t.overdue).sort(urgentFirst);
  const dueToday = open.filter((t) => !t.overdue && t.dueDate === today).sort(urgentFirst);
  const upcoming = open.filter((t) => !t.overdue && t.dueDate !== null && t.dueDate > today).sort(byDue);
  const noDate = open.filter((t) => t.dueDate === null).sort(urgentFirst);

  if (me.isLoading) {
    return (
      <div className="flex flex-col gap-3 max-w-[860px]">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!canView) {
    return (
      <Panel>
        <ErrorState message="You don't have access to tasks." hint="Ask an admin for the task:view permission." />
      </Panel>
    );
  }

  const renderItem = (t: TaskRow) => (
    <TodoItem
      key={t.id}
      task={t}
      onOpen={() => setOpenId(t.id)}
      onToggle={() => toggle.mutate(t)}
      toggling={toggle.isPending && toggle.variables?.id === t.id}
    />
  );
  const chip = (active: boolean) =>
    `min-h-[34px] px-3 rounded-[6px] border text-[12.5px] font-semibold cursor-pointer ${
      active ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink-2'
    }`;

  return (
    <div className="flex flex-col gap-4 max-w-[860px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">My to-do</h1>
        <p className="m-0 text-[12.5px] text-ink-3">
          {open.length} open
          {overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}
          {' · '}your own to-dos and tasks assigned to you.
        </p>
      </div>

      {/* Quick add */}
      <form
        className="bg-surface border border-line rounded-[8px] p-3 md:p-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && !add.isPending) add.mutate();
        }}
      >
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a to-do…"
          maxLength={160}
          aria-label="New to-do"
          autoComplete="off"
        />
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <fieldset className="m-0 p-0 border-0 min-w-0">
            <legend className="mb-1.5 text-[12px] font-semibold text-ink-2">Importance</legend>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Importance">
              {TASK_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={priority === p}
                  onClick={() => setPriority(p)}
                  className={`min-h-[36px] px-3 rounded-[6px] border text-[12.5px] font-semibold cursor-pointer ${
                    priority === p ? `${IMPORTANCE_STYLE[p]} outline outline-2 outline-accent` : 'bg-surface border-line text-ink-3'
                  }`}
                >
                  {TASK_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="sm:w-[190px]">
            <Field label="Due date">
              <DatePicker value={dueDate} onChange={setDueDate} aria-label="Due date (dd/mm/yyyy)" />
            </Field>
          </div>
          <PrimaryButton type="submit" disabled={!title.trim() || add.isPending} className="sm:ml-auto">
            {add.isPending ? 'Adding…' : 'Add to-do'}
          </PrimaryButton>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex gap-1.5">
          {(['open', 'done'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={chip(view === v)}>
              {v === 'open' ? `Open (${open.length})` : `Done (${finished.length})`}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Source" className="flex gap-1.5 sm:ml-auto">
          {(
            [
              ['all', 'All'],
              ['mine', 'My own'],
              ['assigned', 'Assigned to me'],
            ] as [Source, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={source === id} onClick={() => setSource(id)} className={chip(source === id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.isError ? (
        <ErrorState message="Couldn't load your to-dos." onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <Skeleton className="h-40" />
      ) : view === 'open' ? (
        open.length === 0 ? (
          <Panel>
            <p className="m-0 p-6 text-center text-[13px] text-ink-3">Nothing to do — add a to-do above.</p>
          </Panel>
        ) : (
          <>
            <Group title="Overdue" tone="danger" tasks={overdue} render={renderItem} />
            <Group title="Today" tasks={dueToday} render={renderItem} />
            <Group title="Upcoming" tasks={upcoming} render={renderItem} />
            <Group title="No due date" tasks={noDate} render={renderItem} />
          </>
        )
      ) : finished.length === 0 ? (
        <Panel>
          <p className="m-0 p-6 text-center text-[13px] text-ink-3">Nothing finished yet.</p>
        </Panel>
      ) : (
        <Group title="Done" tasks={finished} render={renderItem} />
      )}

      {openId ? <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
