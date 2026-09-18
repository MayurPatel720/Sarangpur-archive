'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { num, severityChip, severityText } from '@/lib/format';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { IconAlertTriangle, IconClock, IconCopy, IconReturn, IconStar } from '@/components/ui/icons';
import type { Severity } from '@/types/dashboard';

const ALERT_ICON: Record<string, typeof IconAlertTriangle> = {
  decision_overdue: IconAlertTriangle,
  scan_stuck: IconClock,
  override_pending: IconStar,
  return_overdue: IconReturn,
  mls_duplicate: IconCopy,
};

/** Tinted square behind each alert icon — the same ramp as its badge. */
const ICON_TILE: Record<Severity, string> = {
  neutral: 'bg-neutral-bg text-neutral',
  info: 'bg-info-bg text-info',
  good: 'bg-good-bg text-good',
  warning: 'bg-warn-bg text-warn',
  critical: 'bg-danger-bg text-danger',
};

export function AlertsPanel() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: dashboardApi.alerts,
  });

  if (error) {
    const e = error as ApiRequestError;
    return (
      <Panel className="lg:flex-[1.15] lg:basis-0 flex flex-col overflow-hidden">
        <PanelHeader title="Alerts & escalations" />
        <ErrorState message={e.message} hint={e.hint} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  return (
    <Panel className="lg:flex-[1.15] lg:basis-0 flex flex-col overflow-hidden">
      <PanelHeader title="Alerts & escalations">
        {!isPending && data.totalOpen > 0 && (
          <Badge severity="critical">{num(data.totalOpen)} open</Badge>
        )}
        <span
          className="ml-auto text-[12.5px] font-semibold text-ink-4"
          title="Alert-rule configuration arrives with the admin screens"
        >
          Alert rules
        </span>
      </PanelHeader>

      <div className="flex-1 flex flex-col">
        {isPending
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-line-row">
                <Skeleton className="w-[30px] h-[30px] rounded-[6px]" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-72 mt-1.5" />
                </div>
                <Skeleton className="h-4 w-6" />
              </div>
            ))
          : data.alerts.map((alert, i) => {
              const Icon = ALERT_ICON[alert.key] ?? IconAlertTriangle;
              return (
                <div
                  key={alert.key}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < data.alerts.length - 1 ? 'border-b border-line-row' : ''
                  }`}
                >
                  <span
                    className={`w-[30px] h-[30px] flex-shrink-0 rounded-[6px] flex items-center justify-center ${ICON_TILE[alert.severity]}`}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-ink">{alert.title}</div>
                    <div className="text-[11.5px] text-ink-3 truncate" title={alert.detail}>
                      {alert.detail}
                    </div>
                  </div>
                  <span
                    className={`text-[14px] font-semibold tnum ${severityText[alert.severity]}`}
                  >
                    {num(alert.count)}
                  </span>
                  <span
                    className="text-[12.5px] font-semibold text-ink-4"
                    title="Queue screens arrive in the next slice"
                  >
                    Review
                  </span>
                </div>
              );
            })}

        {!isPending && data.alerts.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-[4px] border text-[11px] font-semibold ${severityChip.good}`}
            >
              <span className="w-[5px] h-[5px] rounded-full bg-good-mark" />
              All clear
            </span>
            <p className="m-0 text-[12.5px] text-ink-3">
              Nothing is past its threshold right now.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
