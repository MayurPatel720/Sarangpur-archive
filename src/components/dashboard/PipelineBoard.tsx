'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { num, severityText } from '@/lib/format';
import { ErrorState, Meter, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import type { Severity } from '@/types/dashboard';

/** The 2px rule under each column header. Only two stages earn a coloured one. */
const HEAD_RULE: Record<Severity, string> = {
  neutral: 'bg-line-strong',
  info: 'bg-accent',
  good: 'bg-good-mark',
  warning: 'bg-warn-mark',
  critical: 'bg-danger-mark',
};

export function PipelineBoard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard.pipeline(),
    queryFn: dashboardApi.pipeline,
  });

  if (error) {
    const e = error as ApiRequestError;
    return (
      <Panel>
        <PanelHeader title="Active lots by stage" />
        <ErrorState message={e.message} hint={e.hint} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Active lots by stage">
        <span className="text-[11.5px] text-ink-3">
          {isPending ? 'Loading…' : `${num(data.totalActive)} lots in the pipeline`}
        </span>
        <span
          className="ml-auto text-[12.5px] font-semibold text-ink-4"
          title="Register screen arrives in the next slice"
        >
          Open full register
        </span>
      </PanelHeader>

      <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {isPending
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-6 w-8" />
                <Skeleton className="h-[52px] w-full mt-1" />
              </div>
            ))
          : data.stages.map((stage) => (
              <div key={stage.stage} className="flex flex-col gap-2.5 min-w-0">
                <div className="flex flex-col gap-1.5 pb-2.5 relative">
                  <span className="text-[9.5px] font-semibold tracking-[0.1em] uppercase text-ink-3 truncate">
                    {stage.label}
                  </span>
                  <span className="text-[22px] font-semibold leading-none tracking-[-0.022em] text-ink">
                    {num(stage.count)}
                  </span>
                  <span
                    className={`absolute left-0 right-0 bottom-0 h-0.5 ${HEAD_RULE[stage.accent]}`}
                  />
                </div>

                {stage.samples.map((sample) => (
                  <div
                    key={sample.id}
                    className="bg-surface-subtle border border-line-soft rounded-[6px] px-2.5 py-2 flex flex-col gap-1.5 min-w-0"
                  >
                    <span className="font-mono text-[10.5px] font-medium text-accent truncate">
                      {sample.code}
                    </span>
                    {sample.progressPercent !== null && (
                      <Meter
                        percent={sample.progressPercent}
                        severity={sample.progressPercent >= 100 ? 'good' : 'info'}
                        className="h-[5px]"
                      />
                    )}
                    <span
                      className={`text-[10.5px] truncate ${severityText[sample.noteSeverity]}`}
                      title={sample.note}
                    >
                      {sample.note}
                    </span>
                  </div>
                ))}

                {stage.samples.length === 0 && (
                  <div className="border border-dashed border-line rounded-[6px] px-2.5 py-3 text-[10.5px] text-ink-4 text-center">
                    Empty
                  </div>
                )}
              </div>
            ))}
      </div>
    </Panel>
  );
}
