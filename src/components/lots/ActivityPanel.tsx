'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { prettyEnum } from '@/lib/format';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';

const PAGE_SIZE = 25;

export function ActivityPanel({ lotId }: { lotId: string }) {
  const [page, setPage] = useState(1);
  const activity = useQuery({
    queryKey: queryKeys.lots.activity(lotId, page, PAGE_SIZE),
    queryFn: () => lotsApi.activity(lotId, page, PAGE_SIZE),
  });

  const totalPages = activity.data ? Math.max(1, Math.ceil(activity.data.total / activity.data.pageSize)) : 1;

  return (
    <Panel>
      <PanelHeader title="Activity" />
      <div className="p-3 md:p-4 flex flex-col gap-3">
        {activity.isLoading ? (
          <>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </>
        ) : activity.isError ? (
          <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />
        ) : activity.data && activity.data.rows.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2.5">
              {activity.data.rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-0.5 min-w-0 border-b border-line pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge severity="info">{prettyEnum(row.kind)}</Badge>
                    <span className="text-[11px] text-ink-3">{row.at.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <span className="text-[13px] text-ink break-words">{row.title}</span>
                  {row.detail ? <span className="text-[12px] text-ink-2 break-words">{row.detail}</span> : null}
                  <span className="text-[11px] text-ink-3">{row.actorName}</span>
                </li>
              ))}
            </ul>
            {activity.data.total > PAGE_SIZE ? (
              <div className="flex items-center gap-3 text-[13px] text-ink-2">
                <button
                  type="button"
                  className="underline disabled:no-underline disabled:text-ink-4"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {activity.data.page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="underline disabled:no-underline disabled:text-ink-4"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[13px] text-ink-3">No activity yet.</p>
        )}
      </div>
    </Panel>
  );
}
