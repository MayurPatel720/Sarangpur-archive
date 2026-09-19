'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { ALERT_HREF } from '@/lib/dashboard-links';
import { num, severityChip, severityText } from '@/lib/format';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { IconAlertTriangle, IconClock, IconCopy, IconReturn, IconStar } from '@/components/ui/icons';
import type { Severity } from '@/types/dashboard';

const ALERT_ICON: Record<string, typeof IconAlertTriangle> = {
  decision_overdue: IconAlertTriangle,
  scan_stuck: IconClock,
  override_pending: IconStar,
  return_overdue: IconReturn,
  mls_duplicate: IconCopy,
};

const ICON_TILE: Record<Severity, string> = {
  neutral: 'bg-neutral-bg text-neutral',
  info: 'bg-info-bg text-info',
  good: 'bg-good-bg text-good',
  warning: 'bg-warn-bg text-warn',
  critical: 'bg-danger-bg text-danger',
};

export function AlertsManager() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: dashboardApi.alerts,
  });

  if (error) {
    const e = error as ApiRequestError;
    return (
      <Panel>
        <ErrorState message={e.message} hint={e.hint} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1.5 min-w-0">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
          Alerts &amp; escalations
        </h1>
        <p className="m-0 text-[12.5px] text-ink-3">
          {isPending
            ? 'Checking thresholds…'
            : data.totalOpen > 0
              ? `${num(data.totalOpen)} open alerts. Select one to work its queue.`
              : 'Nothing is past its threshold right now.'}
        </p>
      </div>

      <Panel>
        <div className="flex flex-col">
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
                  <Link
                    key={alert.key}
                    href={ALERT_HREF[alert.key] ?? '/dashboard'}
                    className={`flex items-center gap-3 px-4 py-3 no-underline ${
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
                      <div className="text-[11.5px] text-ink-3" title={alert.detail}>
                        {alert.detail}
                      </div>
                    </div>
                    <span
                      className={`text-[14px] font-semibold tnum ${severityText[alert.severity]}`}
                    >
                      {num(alert.count)}
                    </span>
                  </Link>
                );
              })}

          {!isPending && data.alerts.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
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

      {!isPending && (
        <p className="m-0 text-[12px] text-ink-3">
          Counts refresh with the dashboard. Thresholds live in Admin → Settings.
        </p>
      )}
    </div>
  );
}
