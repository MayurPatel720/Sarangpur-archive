'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDrawer } from '@/components/shell/drawer-context';
import { useCanAny } from '@/hooks/useCan';
import { healthApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  IconAlertTriangle,
  IconBox,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardList,
  IconClock,
  IconDashboard,
  IconDatabase,
  IconFileAudio,
  IconFileImage,
  IconFileVideo,
  IconInbox,
  IconSettings,
  IconUsers,
  IconShield,
  IconDiscard,
} from '@/components/ui/icons';

const NAV_ITEMS = [
  { icon: IconDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: IconInbox, label: 'Intake', href: '/intake' },
  { icon: IconClipboardList, label: 'Register', href: '/register' },
  { icon: IconAlertTriangle, label: 'Alerts', href: '/alerts' },
  { icon: IconFileImage, label: 'Photos', href: '/photos' },
  { icon: IconFileVideo, label: 'Video', href: '/video' },
  { icon: IconFileAudio, label: 'Audio', href: '/audio' },
  { icon: IconBox, label: 'Storage', href: '/storage' },
  { icon: IconClock, label: 'Returns', href: '/returns' },
  { icon: IconDiscard, label: 'Disposal', href: '/disposal' },
] as const;

const SECONDARY_ITEMS = [
  { icon: IconDatabase, label: 'Data Sets', href: '/datasets' },
  { icon: IconUsers, label: 'People', href: '/people' },
  { icon: IconSettings, label: 'Settings', href: '/settings' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { open, collapsed, toggleCollapse } = useDrawer();
  // Hover preview: when the rail is collapsed on desktop, hovering it
  // temporarily shows full labels; leaving restores the rail.
  const [hoverExpand, setHoverExpand] = useState(false);
  // Mobile drawer (open) always shows full labels; desktop follows the
  // pinned collapsed state unless hover-previewing.
  const showFull = open || !collapsed || hoverExpand;
  // Hidden until /api/users/me resolves — no flash for non-admins.
  const showAdmin = useCanAny(['user:manage', 'roles:manage', 'lists:manage', 'settings:manage']);

  const health = useQuery({
    queryKey: queryKeys.health.server(),
    queryFn: healthApi.status,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const statusColor =
    health.data?.status === 'healthy'
      ? 'bg-emerald-400'
      : health.data?.status === 'degraded'
        ? 'bg-amber-400'
        : health.isFetching
          ? 'bg-ink-3'
          : 'bg-red-400';

  const statusLabel =
    health.data?.status === 'healthy'
      ? 'Connected'
      : health.data?.status === 'degraded'
        ? 'Slow'
        : health.isFetching
          ? 'Checking…'
          : 'Disconnected';

  return (
    <nav
      onMouseEnter={() => {
        if (collapsed) setHoverExpand(true);
      }}
      onMouseLeave={() => setHoverExpand(false)}
      className={[
        // Base
        'flex-shrink-0 bg-rail flex flex-col select-none overflow-hidden',
        // Desktop (xl+): normal flow, width transitions
        'xl:relative xl:transition-[width] xl:duration-300 xl:ease-out',
        // Mobile (< xl): fixed overlay drawer, slide via transform
        'fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out',
        'xl:translate-x-0',
        // Mobile: hidden when drawer closed, visible when open
        open ? 'translate-x-0' : '-translate-x-full',
        // Width: on desktop toggle collapsed (or hover-preview), on mobile always full 248px
        'w-[248px]',
        !showFull && 'xl:w-[76px]',
      ].join(' ')}
    >
      {/* Workspace switcher */}
      <div
        className={`flex flex-col border-b border-rail-line ${showFull ? 'px-4 py-4 gap-2.5' : 'items-center px-0 py-4'}`}
      >
        <div className={`flex items-center ${showFull ? 'gap-2.5' : ''}`}>
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-white tracking-[0.03em]">SA</span>
          </div>
          {showFull && (
            <>
              <span className="sidebar-label-in flex-1 text-[12.5px] font-semibold text-rail-text-strong leading-tight truncate">
                Sarangpur Archive
              </span>
              <span className="text-rail-muted text-[10px]">▾</span>
            </>
          )}
        </div>

        {/* Server status */}
        {!showFull ? (
          <span
            title={`${statusLabel}${health.data ? ` · ${health.data.server} (${health.data.latencyMs}ms)` : ''}`}
            className={`mt-2 w-[7px] h-[7px] rounded-full flex-shrink-0 ${statusColor}`}
          />
        ) : (
          <div className="sidebar-label-in flex items-center gap-2 pl-[42px]">
            <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${statusColor}`} />
            <span className="text-[10.5px] text-rail-muted truncate">
              {health.data
                ? `${health.data.server}`
                : statusLabel}
            </span>
            {health.data?.latencyMs !== undefined && (
              <span className="text-[9.5px] text-rail-muted/60 tabular-nums ml-auto">
                {health.data.latencyMs}ms
              </span>
            )}
          </div>
        )}
      </div>

      {/* Primary nav — scrolls internally on short viewports so the
          last tiles (Admin) are never clipped behind the footer. */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-2.5 pt-3 pb-3 ${
          showFull ? 'scrollbar-thin' : 'scrollbar-none'
        }`}
      >
        <SectionLabel collapsed={!showFull}>Workflow</SectionLabel>
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} active={pathname === item.href} collapsed={!showFull} />
        ))}

        <SectionLabel collapsed={!showFull}>Manage</SectionLabel>
        {SECONDARY_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} active={pathname === item.href} collapsed={!showFull} />
        ))}
        {showAdmin && (
          <NavRow
            item={{ icon: IconShield, label: 'Admin', href: '/admin/users' }}
            active={pathname.startsWith('/admin')}
            collapsed={!showFull}
          />
        )}
      </div>

      {/* Bottom: project tile with the collapse toggle inline */}
      <div
        className={`flex items-center border-t border-rail-line ${showFull ? 'px-4 py-3 gap-2.5' : 'justify-center px-0 py-3 gap-2'}`}
      >
        <div className="w-5 h-5 rounded-sm bg-rail-control flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-semibold text-rail-muted">AP</span>
        </div>
        {showFull && (
          <span className="sidebar-label-in flex-1 text-[11.5px] text-rail-text truncate">Archive Program</span>
        )}
        <button
          type="button"
          onClick={toggleCollapse}
          className="hidden xl:flex items-center justify-center cursor-pointer border-0 bg-transparent text-rail-muted hover:text-rail-text transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Pin open' : 'Collapse to rail'}
        >
          {collapsed ? <IconChevronRight size={15} /> : <IconChevronLeft size={15} />}
        </button>
      </div>
    </nav>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <span className="sidebar-label-in px-2 pt-5 pb-1 text-[9.5px] font-semibold tracking-[0.12em] uppercase text-rail-muted">
      {children}
    </span>
  );
}

function NavRow({
  item,
  active,
  collapsed,
}: {
  item: { icon: React.ElementType; label: string; href: string };
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <a
      href={item.href}
      title={item.label}
      className={`h-[38px] rounded-md flex items-center gap-2.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-accent/25 text-white shadow-[inset_2px_0_0_0_var(--color-accent-bright)]'
          : 'text-rail-text hover:bg-rail-control hover:text-rail-text-strong'
      } ${collapsed ? 'justify-center px-0' : 'px-2.5'}`}
    >
      <Icon size={17} className={`flex-shrink-0 ${active ? 'text-accent-tint' : ''}`} />
      {!collapsed && <span className="sidebar-label-in truncate">{item.label}</span>}
    </a>
  );
}
