'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError, tasksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { scopedHref } from '@/lib/dashboard-links';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { date, num, todayIso } from '@/lib/format';
import { useMe } from '@/hooks/useCan';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { AssignTaskDialog } from '@/components/tasks/AssignTaskDialog';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { TaskPeopleStrip } from '@/components/tasks/TaskPeopleStrip';
import type { TaskRow } from '@/types/task';

function GroupHeading({ label, count, tone }: { label: string; count: number; tone?: 'critical' }) {
  return (
    <div className="flex items-center gap-2 px-4 md:px-5 py-2 bg-surface-sunken border-b border-line-row">
      <h3 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-2">{label}</h3>
      <Badge severity={tone === 'critical' ? 'critical' : 'neutral'}>{num(count)}</Badge>
    </div>
  );
}

/**
 * Today's tasks — the dashboard panel that replaced the Physical / Digital shortcut row.
 * Groups: Overdue, Due today, Upcoming, Done recently, then the viewer's assigned lots as
 * read-only derived rows. Admins get "Assign task" and the per-person strip.
 * `format` scopes everything to that dashboard's format; absent = all formats.
 */
export function TodaysTasks({ format }: { format?: Format }) {
  const me = useMe();
  const [assignee, setAssignee] = useState<string | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const grants = me.data?.grants;
  const canView = grants?.includes('task:view') ?? false;
  const canAssign = grants?.includes('task:assign') ?? false;
  const isAdmin = grants?.includes('task:viewAll') ?? false;

  const today = todayIso();
  const params: Record<string, string> = {
    today,
    ...(format ? { format } : {}),
    ...(isAdmin && assignee ? { assignee } : {}),
  };
  const panel = useQuery({
    queryKey: queryKeys.tasks.panel(JSON.stringify(params)),
    queryFn: () => tasksApi.panel(params),
    enabled: canView,
    refetchInterval: 60_000,
  });

  // Roles that predate the Tasks feature lack task:view until the backfill runs — hide, don't error.
  if (me.data && !canView) return null;

  const title = format ? `Today's tasks · ${FORMAT_LABELS[format]}` : "Today's tasks";
  const allHref = scopedHref('/tasks', format);

  const renderGroup = (
    label: string,
    group: { rows: TaskRow[]; total: number } | undefined,
    moreQuery: string,
    tone?: 'critical',
  ) => {
    if (!group || group.total === 0) return null;
    return (
      <div key={label}>
        <GroupHeading label={label} count={group.total} tone={tone} />
        {group.rows.map((t) => (
          <TaskCard key={t.id} task={t} onOpen={setOpenId} showAssignee={isAdmin} />
        ))}
        {group.total > group.rows.length ? (
          <Link
            href={`${allHref}${allHref.includes('?') ? '&' : '?'}${moreQuery}`}
            className="block px-4 md:px-5 py-2 text-[12px] font-semibold text-ink-3 no-underline hover:text-ink border-b border-line-row"
          >
            +{num(group.total - group.rows.length)} more
          </Link>
        ) : null}
      </div>
    );
  };

  const data = panel.data;
  // Admin doesn't own lots, so their own panel has no "assigned lots" block; picking a person still shows theirs.
  const showDerived = !isAdmin || !!assignee;
  const empty =
    data !== undefined &&
    data.overdue.total + data.dueToday.total + data.upcoming.total + data.doneRecently.total === 0 &&
    (!showDerived || data.derived.total === 0);

  return (
    <Panel className="flex flex-col overflow-hidden">
      <PanelHeader title={title}>
        {data && data.overdue.total > 0 ? <Badge severity="critical">{num(data.overdue.total)} overdue</Badge> : null}
        <div className="ml-auto flex items-center gap-3">
          <Link href={allHref} className="text-[12.5px] font-semibold text-ink-4 no-underline hover:text-ink">
            All tasks
          </Link>
          {canAssign ? (
            <button
              type="button"
              onClick={() => setAssigning(true)}
              className="h-8 px-3 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[12.5px] font-semibold cursor-pointer"
            >
              Assign task
            </button>
          ) : null}
        </div>
      </PanelHeader>

      {isAdmin && data ? <TaskPeopleStrip people={data.people} selectedId={assignee} onSelect={setAssignee} /> : null}

      <div className="max-h-[460px] overflow-y-auto">
        {panel.isError ? (
          <ErrorState
            message={panel.error instanceof ApiRequestError ? panel.error.message : 'Could not load tasks.'}
            hint={panel.error instanceof ApiRequestError ? panel.error.hint : undefined}
            onRetry={() => void panel.refetch()}
          />
        ) : !data ? (
          <div className="flex flex-col gap-3 p-4" aria-label="Loading tasks">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : empty ? (
          <p className="m-0 px-4 py-8 text-center text-[13px] font-medium text-ink-3">
            Nothing on the list. {canAssign ? 'Assign a task to get the day started.' : 'Enjoy the quiet.'}
          </p>
        ) : (
          <>
            {renderGroup('Overdue', data.overdue, 'due=overdue', 'critical')}
            {renderGroup('Due today', data.dueToday, 'due=today')}
            {renderGroup('Upcoming', data.upcoming, 'due=upcoming')}
            {renderGroup('Done recently', data.doneRecently, 'status=done')}
            {showDerived && data.derived.total > 0 ? (
              <div>
                <GroupHeading
                  label={isAdmin && assignee ? 'Assigned lots' : 'Your assigned lots'}
                  count={data.derived.total}
                />
                {data.derived.rows.map((d) => (
                  <div
                    key={d.lotId}
                    className="flex items-center gap-2 px-4 md:px-5 py-2.5 border-b border-line-row last:border-b-0"
                  >
                    <Badge severity="info">{d.action}</Badge>
                    <Link
                      href={`/register/${d.lotId}`}
                      className="font-mono text-[12.5px] font-semibold text-ink no-underline hover:underline"
                    >
                      {d.lotCode}
                    </Link>
                    <span className="text-[11.5px] text-ink-3 ml-auto whitespace-nowrap">
                      {FORMAT_LABELS[d.format as Format] ?? d.format} · since {date(d.stageEnteredAt)}
                    </span>
                  </div>
                ))}
                {data.derived.total > data.derived.rows.length ? (
                  <Link
                    href="/register?assignee=me"
                    className="block px-4 md:px-5 py-2 text-[12px] font-semibold text-ink-3 no-underline hover:text-ink"
                  >
                    +{num(data.derived.total - data.derived.rows.length)} more lots
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {openId ? <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} /> : null}
      {assigning ? (
        <AssignTaskDialog defaultFormat={format} onClose={() => setAssigning(false)} onCreated={setOpenId} />
      ) : null}
    </Panel>
  );
}
