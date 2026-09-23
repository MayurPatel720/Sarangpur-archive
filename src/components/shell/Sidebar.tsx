'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDrawer } from '@/components/shell/drawer-context';
import { useMe } from '@/hooks/useCan';
import { dashboardApi, healthApi } from '@/lib/api-client';
import { formatBytes, num } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { SIDEBAR_WIDTH_CLASS } from '@/lib/shell';
import type { Permission } from '@/server/permissions';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardList,
  IconDashboard,
  IconFileAudio,
  IconFileImage,
  IconFileVideo,
  IconSettings,
  IconStorage,
  IconDecision,
  IconScan,
  IconTag,
  IconReturn,
  IconDiscard,
} from '@/components/ui/icons';

type NavItem = { icon: React.ElementType; label: string; href: string };

const WORKFLOW_ITEMS = [
  { icon: IconDashboard, label: 'Dashboard', href: '/dashboard', perm: 'dashboard:view' },
  { icon: IconClipboardList, label: 'Register', href: '/register', perm: 'lot:view' },
  { icon: IconAlertTriangle, label: 'Alerts', href: '/alerts', perm: null },
] as const;

const MEDIA_ITEMS = [
  { icon: IconFileImage, label: 'Photos', href: '/register?format=photo', perm: 'lot:view' },
  { icon: IconFileVideo, label: 'Video', href: '/register?format=video', perm: 'lot:view' },
  { icon: IconFileAudio, label: 'Audio', href: '/register?format=audio', perm: 'lot:view' },
  { icon: IconStorage, label: 'Storage', href: '/register?stage=storage', perm: 'lot:view' },
] as const;

const QUEUE_ITEMS = [
  {
    icon: IconDecision,
    label: 'Decision queue',
    href: '/queues/decision',
    perm: 'decision:view' as Permission,
    kpi: 'awaiting_decision',
  },
  {
    icon: IconScan,
    label: 'Digitization queue',
    href: '/queues/digitize',
    perm: 'digitize:view' as Permission,
    kpi: 'in_digitization',
  },
  {
    icon: IconTag,
    label: 'MLS tagging queue',
    href: '/queues/mls',
    perm: 'mls:view' as Permission,
    kpi: 'awaiting_mls_tag',
  },
  {
    icon: IconReturn,
    label: 'Returns queue',
    href: '/queues/returns',
    perm: 'returns:view' as Permission,
    kpi: null,
  },
  {
    icon: IconDiscard,
    label: 'Discards',
    href: '/queues/discards',
    perm: 'discards:view' as Permission,
    kpi: null,
  },
] as const;

function formatBadge(n: number): string {
  return n > 99 ? '99+' : num(n);
}

/** Deep-link Settings to the first admin screen the user can actually open. */
function settingsHrefFor(grants: readonly string[] | undefined): string {
  if (!grants) return '/admin';
  if (grants.includes('settings:manage')) return '/admin/settings';
  if (grants.includes('user:manage')) return '/admin/users';
  if (grants.includes('roles:manage')) return '/admin/roles';
  if (grants.includes('lists:manage')) return '/admin/lists';
  return '/admin';
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open, collapsed: collapsedPref, railReady: providerReady, toggleCollapse } = useDrawer();
  const [hoverExpand, setHoverExpand] = useState(false);
  const [focusExpand, setFocusExpand] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  /**
   * Suspense (useSearchParams) can hydrate this subtree after DrawerProvider has
   * already restored the collapsed preference from localStorage. Server HTML is
   * always expanded — keep that until our mount + provider restore have both run.
   */
  const [selfMounted, setSelfMounted] = useState(false);
  useEffect(() => {
    setSelfMounted(true);
  }, []);
  // After a nav click the link keeps focus; without this the peek never closes.
  // Key on pathname + search so Photos/Video/etc. reset even on the same route.
  const searchKey = searchParams.toString();
  useEffect(() => {
    setHoverExpand(false);
    setFocusExpand(false);
  }, [pathname, searchKey]);
  const railReady = selfMounted && providerReady;
  const collapsed = railReady ? collapsedPref : false;
  const showFull = open || !collapsed || hoverExpand || focusExpand;

  const collapseNow = () => {
    setHoverExpand(false);
    setFocusExpand(false);
    toggleCollapse();
  };

  const { data: me } = useMe();
  const ready = me !== undefined;
  const grants = me?.grants;
  const can = (p: Permission) => grants?.includes(p) ?? false;

  /** Core rows: optimistic while `/api/users/me` loads (system roles always have them). */
  const showCore = (perm: Permission | null) => !ready || perm === null || can(perm);
  /** Gated rows: only after me resolves — appear once, never flash out. */
  const showGated = (perm: Permission) => ready && can(perm);

  const showSettings = showGated('settings:manage') || showGated('user:manage') || showGated('roles:manage') || showGated('lists:manage');
  const settingsHref = settingsHrefFor(grants);

  const formatParam = searchParams.get('format');
  const stageParam = searchParams.get('stage');
  const onRegister = pathname === '/register' || pathname.startsWith('/register/');
  const onAdmin = pathname.startsWith('/admin');

  const health = useQuery({
    queryKey: queryKeys.health.server(),
    queryFn: healthApi.status,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const alerts = useQuery({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: dashboardApi.alerts,
    enabled: ready,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const summary = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.summary,
    enabled: ready && showCore('dashboard:view'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const kpiValue = (key: string): number | null => {
    if (!summary.data) return null;
    return summary.data.kpis.find((k) => k.key === key)?.value ?? null;
  };

  /**
   * First paint must be identical on server and client. React Query's fetchStatus
   * differs across that boundary, so only trust data / an explicit fetching state
   * once this tree has mounted.
   */
  const statusColor =
    health.data?.status === 'healthy'
      ? 'bg-good-mark'
      : health.data?.status === 'degraded'
        ? 'bg-warn-mark'
        : railReady && health.isFetching
          ? 'bg-ink-3'
          : health.data
            ? 'bg-danger-mark'
            : 'bg-ink-3';

  const statusLabel =
    health.data?.status === 'healthy'
      ? 'Connected'
      : health.data?.status === 'degraded'
        ? 'Slow'
        : health.data
          ? 'Disconnected'
          : 'Checking…';

  const statusText = `${statusLabel}${health.data ? ` · ${health.data.storage.label} ${health.data.storage.root} (${health.data.storage.usedTb}/${health.data.storage.capacityTb} TB)` : ''}`;

  const checkedAt =
    railReady && health.dataUpdatedAt
      ? new Date(health.dataUpdatedAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : null;

  const alertBadge = alerts.data?.totalOpen ?? 0;

  const rows: {
    item: NavItem;
    active: boolean;
    badge: number | null;
    badgeTitle?: string;
  }[] = [];

  for (const item of WORKFLOW_ITEMS) {
    if (!showCore(item.perm)) continue;
    rows.push({
      item,
      active:
        item.href === '/register'
          ? onRegister && !formatParam && !stageParam
          : pathname === item.href,
      badge: item.href === '/alerts' && alertBadge > 0 ? alertBadge : null,
      badgeTitle: item.href === '/alerts' ? `${alertBadge} open alerts` : undefined,
    });
  }

  for (const item of MEDIA_ITEMS) {
    if (!showCore(item.perm)) continue;
    rows.push({
      item,
      active:
        onRegister &&
        ((item.href === '/register?format=photo' && formatParam === 'photo') ||
          (item.href === '/register?format=video' && formatParam === 'video') ||
          (item.href === '/register?format=audio' && formatParam === 'audio') ||
          (item.href === '/register?stage=storage' && stageParam === 'storage')),
      badge: null,
    });
  }

  for (const q of QUEUE_ITEMS) {
    if (!showGated(q.perm)) continue;
    const badge = q.kpi ? kpiValue(q.kpi) : null;
    rows.push({
      item: { icon: q.icon, label: q.label, href: q.href },
      active: pathname.startsWith(q.href),
      badge: badge !== null && badge > 0 ? badge : null,
      badgeTitle: badge !== null ? `${badge} in queue` : undefined,
    });
  }

  if (showSettings) {
    rows.push({
      item: { icon: IconSettings, label: 'Settings', href: settingsHref },
      active: onAdmin,
      badge: null,
    });
  }

  return (
    <nav
      aria-label="Primary"
      onMouseEnter={() => {
        if (collapsed) setHoverExpand(true);
      }}
      onMouseLeave={() => setHoverExpand(false)}
      onFocus={() => {
        if (collapsed) setFocusExpand(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusExpand(false);
        }
      }}
      className={[
        'flex-shrink-0 bg-rail flex flex-col select-none overflow-hidden',
        'xl:relative xl:transition-[width] xl:duration-300 xl:ease-out',
        'fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out',
        'xl:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
        SIDEBAR_WIDTH_CLASS.full,
        !showFull && SIDEBAR_WIDTH_CLASS.collapsed,
      ].join(' ')}
    >
      {/* Workspace / storage disclosure */}
      <div
        className={`flex flex-col border-b border-rail-line ${showFull ? 'px-4 py-4 gap-2' : 'items-center px-0 py-5 gap-2'}`}
      >
        <button
          type="button"
          onClick={() => setStorageOpen((v) => !v)}
          aria-expanded={storageOpen}
          title={storageOpen ? 'Hide storage details' : 'Show storage details'}
          className={`flex items-center text-left rounded-md cursor-pointer ${showFull ? 'gap-2.5 w-full' : ''}`}
        >
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-[11.5px] font-semibold text-white tracking-[0.03em]">SA</span>
          </div>
          {showFull && (
            <>
              <span className="sidebar-label-in flex-1 text-[13px] font-semibold text-rail-text-strong leading-tight truncate">
                Sarangpur Archive
              </span>
              <IconChevronDown
                size={13}
                className={`text-rail-muted transition-transform duration-200 ${storageOpen ? 'rotate-180' : ''}`}
              />
            </>
          )}
        </button>

        {!showFull ? (
          <span
            role="status"
            aria-label={statusText}
            title={statusText}
            className={`mt-2 w-[7px] h-[7px] rounded-full flex-shrink-0 ${statusColor}`}
          />
        ) : storageOpen ? (
          <div className="sidebar-label-in flex flex-col gap-1 pl-[42px] pr-1">
            <div className="flex items-center gap-2">
              <span
                role="status"
                aria-label={statusLabel}
                className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${statusColor}`}
              />
              <span className="text-[10.5px] text-rail-muted truncate">
                {health.data ? health.data.storage.label : statusLabel}
              </span>
              {checkedAt && (
                <span
                  className="text-[9.5px] text-rail-muted/60 tabular-nums ml-auto"
                  title={`Health checked at ${checkedAt}`}
                >
                  {checkedAt}
                </span>
              )}
            </div>
            {health.data && (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10.5px] font-medium text-rail-text-strong">Archive storage</span>
                  <span className="text-[9.5px] text-rail-muted tabular-nums ml-auto">
                    {health.data.storage.usedTb} / {health.data.storage.capacityTb} TB
                  </span>
                </div>
                <div
                  className="h-[4px] rounded-full bg-rail-line overflow-hidden"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    health.data.storage.capacityTb > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (health.data.storage.usedTb / health.data.storage.capacityTb) * 100,
                          ),
                        )
                      : 0
                  }
                  aria-label="Archive storage used"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${
                        health.data.storage.capacityTb > 0
                          ? Math.min(
                              100,
                              (health.data.storage.usedTb / health.data.storage.capacityTb) * 100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div
                  className="text-[9px] text-rail-muted/60 tabular-nums truncate"
                  title={`${health.data.storage.root} · Indexed ${formatBytes(health.data.storage.indexedBytes)} · ${health.data.storage.indexedFiles} files`}
                >
                  {health.data.storage.root} · {health.data.storage.indexedFiles} files
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Primary nav */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 px-3 pt-5 pb-4 ${
          showFull ? 'scrollbar-thin' : 'scrollbar-none'
        }`}
      >
        {rows.map((row) => (
          <NavRow
            key={row.item.href + (row.badge ?? '')}
            item={row.item}
            active={row.active}
            collapsed={!showFull}
            badge={row.badge}
            badgeTitle={row.badgeTitle}
          />
        ))}
      </div>

      {/* Footer: collapse is the only control */}
      <div className="border-t border-rail-line p-2">
        <button
          type="button"
          onClick={collapseNow}
          className={`hidden xl:flex w-full items-center h-10 rounded-md text-rail-text hover:bg-rail-control hover:text-rail-text-strong transition-colors cursor-pointer border-0 ${
            showFull ? 'gap-3 px-3 justify-start' : 'justify-center px-0'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Pin open' : 'Collapse to rail'}
        >
          {collapsed ? <IconChevronRight size={15} /> : <IconChevronLeft size={15} />}
          {showFull && <span className="sidebar-label-in text-[12.5px] font-medium">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  badge,
  badgeTitle,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge: number | null;
  badgeTitle?: string;
}) {
  const Icon = item.icon;
  const showBadge = badge !== null && badge > 0;

  return (
    <Link
      href={item.href}
      title={badgeTitle ? `${item.label} — ${badgeTitle}` : item.label}
      aria-current={active ? 'page' : undefined}
      className={`relative h-[42px] rounded-md flex items-center text-[13.5px] font-medium transition-colors ${
        collapsed ? 'gap-0 justify-center px-0' : 'gap-3 px-3'
      } ${
        active
          ? 'bg-accent/25 text-white shadow-[inset_2px_0_0_0_var(--color-accent-bright)]'
          : 'text-rail-text hover:bg-rail-control hover:text-rail-text-strong'
      }`}
    >
      <span className="relative flex-shrink-0">
        <Icon size={17} className={active ? 'text-accent-tint' : ''} />
        {collapsed && showBadge && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-[3px] box-border rounded-full bg-danger-mark text-white text-[8.5px] font-semibold leading-[14px] text-center tnum"
          >
            {formatBadge(badge!)}
          </span>
        )}
      </span>
      {!collapsed && (
        <>
          <span className="sidebar-label-in truncate flex-1 text-left">{item.label}</span>
          {showBadge && (
            <span
              aria-hidden="true"
              className="sidebar-label-in flex-shrink-0 min-w-[20px] h-[18px] px-1.5 box-border rounded-full bg-rail-control text-rail-text-strong text-[10.5px] font-semibold leading-[18px] text-center tnum"
            >
              {formatBadge(badge!)}
            </span>
          )}
        </>
      )}
      {showBadge && <span className="sr-only">{badgeTitle ?? `${badge} items`}</span>}
    </Link>
  );
}
