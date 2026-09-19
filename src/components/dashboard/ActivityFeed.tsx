'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { relativeStamp, severityMark } from '@/lib/format';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';

const LIMIT = 8;

export function ActivityFeed() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard.activity(LIMIT),
    queryFn: () => dashboardApi.activity(LIMIT),
  });

  if (error) {
    const e = error as ApiRequestError;
    return (
      <Panel className="lg:flex-1 lg:basis-0 flex flex-col overflow-hidden">
        <PanelHeader title="Recent activity" />
        <ErrorState message={e.message} hint={e.hint} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  return (
      <Panel className="lg:flex-1 lg:basis-0 flex flex-col overflow-hidden">
      <PanelHeader title="Recent activity" />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 flex flex-col gap-3">
        {isPending
          ? Array.from({ length: LIMIT }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="w-[7px] h-[7px] rounded-full mt-1.5" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-64 mt-1.5" />
                </div>
              </div>
            ))
          : data.entries.map((entry) => (
              <div key={entry.id} className="flex gap-2.5">
                <span
                  className={`w-[7px] h-[7px] rounded-full mt-[5px] flex-shrink-0 ${severityMark[entry.severity]}`}
                />
                <div className="min-w-0">
                  <div className="text-[12.5px] text-ink">
                    <strong className="font-semibold">{entry.title}</strong>
                    {' · '}
                    <span className="font-mono text-[11.5px] text-accent">{entry.lotCode}</span>
                  </div>
                  <div className="text-[11.5px] text-ink-3">
                    {entry.detail ? `${entry.detail} · ` : ''}
                    {entry.actorName} · {relativeStamp(entry.at)}
                  </div>
                </div>
              </div>
            ))}

        {!isPending && data.entries.length === 0 && (
          <p className="m-0 text-[12.5px] text-ink-3">
            No activity recorded yet. Run <code className="font-mono">npm run seed</code>.
          </p>
        )}
      </div>
    </Panel>
  );
}
