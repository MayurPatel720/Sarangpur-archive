'use client';

import { useQuery } from '@tanstack/react-query';
import { lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { dateTime, prettyEnum } from '@/lib/format';
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
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(25);
  const activity = useQuery({
    queryKey: queryKeys.lots.activity(lotId, page, pageSize),
    queryFn: () => lotsApi.activity(lotId, page, pageSize),
  });

  const totalPages = activity.data ? totalPagesOf(activity.data.total, activity.data.pageSize) : 1;

  return (
    <Panel>
      <PanelHeader title="Activity" />
      <div className="p-3 md:p-4 pb-0 flex flex-col gap-3">
        {activity.isLoading ? (
          <>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </>
        ) : activity.isError ? (
          <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />
        ) : activity.data && activity.data.rows.length > 0 ? (
          <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
            {activity.data.rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5 min-w-0 border-b border-line pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge severity="info">{prettyEnum(row.kind)}</Badge>
                  <span className="text-[11px] text-ink-3">{dateTime(row.at)}</span>
                </div>
                <span className="text-[13px] text-ink break-words">{row.title}</span>
                {row.detail ? <span className="text-[12px] text-ink-2 break-words">{row.detail}</span> : null}
                <span className="text-[11px] text-ink-3">{row.actorName}</span>
              </li>
            ))}
          </ul>
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
