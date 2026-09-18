'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { num, severityText } from '@/lib/format';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';

export function KpiRow() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.summary,
  });

  if (error) {
    const e = error as ApiRequestError;
    return (
      <Panel>
        <ErrorState message={e.message} hint={e.hint} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  if (isPending) {
    return (
      <div className="flex gap-3.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Panel key={i} className="flex-1 basis-0 px-4 pt-[15px] pb-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16 mt-2" />
            <Skeleton className="h-3 w-32 mt-2" />
          </Panel>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3.5">
      {data.kpis.map((kpi) => (
        <Panel key={kpi.key} className="flex-1 basis-0 px-4 pt-[15px] pb-4">
          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] font-medium text-ink-3">{kpi.label}</span>
            {/* Proportional figures: a large standalone number reads loose with tabular-nums. */}
            <span className="text-[32px] font-semibold leading-none tracking-[-0.028em] text-ink">
              {num(kpi.value)}
            </span>
            <span className={`text-[11.5px] font-medium ${severityText[kpi.noteSeverity]}`}>
              {kpi.note}
            </span>
          </div>
        </Panel>
      ))}
    </div>
  );
}
