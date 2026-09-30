'use client';

import { useQuery } from '@tanstack/react-query';
import { lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { ACTIVITY_SEVERITY, type ActivityKind } from '@/lib/domain';
import { dateTime12, prettyEnum, severityMark } from '@/lib/format';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useUrlPagination } from '@/lib/useUrlPagination';
import { Suspense } from 'react';

export function ActivityPanel({ lotId }: { lotId: string }) {
  return (
    <Suspense fallback={null}>
      <ActivityPanelInner lotId={lotId} />
    </Suspense>
  );
}

function ActivityPanelInner({ lotId }: { lotId: string }) {
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(25, 'activity');
  const activity = useQuery({
    queryKey: queryKeys.lots.activity(lotId, page, pageSize),
    queryFn: () => lotsApi.activity(lotId, page, pageSize),
  });

  const totalPages = activity.data ? totalPagesOf(activity.data.total, activity.data.pageSize) : 1;

  // Per-media-type grouping (F4): entries tagged with a line's sub-type render
  // under that heading; lot-wide entries stay under "General". Grouping is
  // per page — the server order (newest first) is preserved inside groups.
  type Row = NonNullable<typeof activity.data>['rows'][number];
  const groups: { key: string; label: string; rows: Row[] }[] = [];
  for (const row of activity.data?.rows ?? []) {
    const key = row.mediaSubtype ?? '';
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: key || 'General', rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }

  const renderEntry = (row: Row, last: boolean) => {
    const severity = ACTIVITY_SEVERITY[row.kind as ActivityKind] ?? 'info';
    return (
      <li key={row.id} className="relative pl-7 pb-5 last:pb-0 min-w-0">
        {!last ? (
          <span aria-hidden className="absolute left-[7px] top-5 bottom-0 w-px bg-line-soft" />
        ) : null}
        <span
          aria-hidden
          className={`absolute left-[3px] top-[5px] w-2 h-2 rounded-full ${severityMark[severity]}`}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Badge severity={severity}>{prettyEnum(row.kind)}</Badge>
          <span className="text-[11px] text-ink-3">{dateTime12(row.at)}</span>
        </div>
        <span className="block mt-1 text-[13px] font-medium text-ink break-words">{row.title}</span>
        {row.detail ? <span className="block text-[12px] text-ink-2 break-words">{row.detail}</span> : null}
        <span className="block text-[11px] text-ink-3">{row.actorName}</span>
      </li>
    );
  };

  return (
    <Panel>
      <PanelHeader title="Activity" />
      <div className="p-3 md:p-4 pb-0 flex flex-col gap-4">
        {activity.isLoading ? (
          <>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </>
        ) : activity.isError ? (
          <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />
        ) : activity.data && activity.data.rows.length > 0 ? (
          groups.map((g) => (
            <section key={g.key || 'general'} aria-label={`Activity — ${g.label}`}>
              {groups.length > 1 ? (
                <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  {g.label}
                </h3>
              ) : null}
              <ol className="relative flex flex-col m-0 p-0 list-none">
                {g.rows.map((row, i) => renderEntry(row, i === g.rows.length - 1))}
              </ol>
            </section>
          ))
        ) : (
          <p className="text-[13px] text-ink-3">No activity yet.</p>
        )}
      </div>
      {activity.data && activity.data.total > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={activity.data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          label="entries"
        />
      ) : null}
    </Panel>
  );
}
