'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, notificationsApi } from '@/lib/api-client';
import { scopedHref } from '@/lib/dashboard-links';
import { dateTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useFormatContext } from '@/hooks/useFormatParam';
import { useMe } from '@/hooks/useCan';
import { IconBell } from '@/components/ui/icons';
import { ErrorState, Skeleton } from '@/components/ui/primitives';

/**
 * The header bell. The badge is the open lot alerts (computed from lot data, scoped to
 * the active format block) PLUS the caller's unread task notifications (the
 * `notifications` collection — alerts cannot carry events). The popover lists the
 * notifications and keeps a link to the alerts page. Reads useSearchParams, so Header
 * renders it behind a local Suspense boundary.
 */
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const format = useFormatContext();
  const me = useMe();
  const [open, setOpen] = useState(false);

  const alerts = useQuery({
    queryKey: queryKeys.dashboard.alerts(format),
    queryFn: () => dashboardApi.alerts(format),
  });
  const canTasks = me.data?.grants.includes('task:view') ?? false;
  const inbox = useQuery({
    queryKey: queryKeys.notifications.list(1),
    queryFn: () => notificationsApi.list(1),
    enabled: canTasks,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const openAlerts = alerts.data?.totalOpen ?? 0;
  const unread = inbox.data?.unreadCount ?? 0;
  const count = openAlerts + unread;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications, ${openAlerts} open alerts, ${unread} unread task updates`}
        className="relative w-10 h-10 bg-surface border border-line rounded-[6px] shadow-control text-ink-2 flex items-center justify-center cursor-pointer"
      >
        <IconBell size={17} />
        {count > 0 && (
          <span className="absolute -top-[5px] -right-[5px] min-w-[17px] h-[17px] px-1 box-border bg-danger-mark border-2 border-surface rounded-full text-white text-[9.5px] font-semibold leading-[13px] text-center tnum">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0"
          />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] max-w-[calc(100vw-1.5rem)] rounded-[8px] border border-line bg-surface shadow-control overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-line-soft">
              <span className="text-[13px] font-semibold text-ink">Notifications</span>
              {unread > 0 ? (
                <button
                  type="button"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate({ all: true })}
                  className="ml-auto text-[12px] font-semibold text-ink-3 hover:text-ink bg-transparent border-0 cursor-pointer"
                >
                  Mark all read
                </button>
              ) : null}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {inbox.isError ? (
                <ErrorState message="Could not load notifications." onRetry={() => void inbox.refetch()} />
              ) : !canTasks ? null : inbox.isPending ? (
                <div className="flex flex-col gap-2 p-3.5">
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-3.5 w-44" />
                </div>
              ) : inbox.data.rows.length === 0 ? (
                <p className="m-0 px-3.5 py-6 text-center text-[12.5px] text-ink-3">No task updates yet.</p>
              ) : (
                inbox.data.rows.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.read) markRead.mutate({ ids: [n.id] });
                      setOpen(false);
                      router.push(`/tasks?task=${n.taskId}`);
                    }}
                    className="w-full text-left flex gap-2.5 px-3.5 py-2.5 bg-surface hover:bg-surface-sunken border-0 border-b border-line-row cursor-pointer"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 w-2 h-2 flex-shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-info-mark'}`}
                    />
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className={`text-[12.5px] break-words ${n.read ? 'text-ink-2' : 'font-semibold text-ink'}`}>
                        {n.text}
                        {n.read ? '' : <span className="sr-only"> (unread)</span>}
                      </span>
                      <span className="text-[11px] text-ink-3">{dateTime(n.createdAt)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <Link
              href={scopedHref('/alerts', format)}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-3.5 py-2.5 border-t border-line-soft text-[12.5px] font-semibold text-ink-2 no-underline hover:bg-surface-sunken"
            >
              <span>Lot alerts</span>
              <span className="tnum text-ink-3">{openAlerts} open</span>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
