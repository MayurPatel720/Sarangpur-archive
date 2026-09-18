'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { num } from '@/lib/format';
import {
  IconClock,
  IconCollapse,
  IconDashboard,
  IconDecision,
  IconDiscard,
  IconIntake,
  IconReturn,
  IconScan,
  IconStorage,
  IconTag,
  IconUsers,
} from '@/components/ui/icons';

type NavItem = {
  key: string;
  label: string;
  href: string | null;
  icon: typeof IconDashboard;
  /** Which dashboard number to show as the count, if any. */
  countFrom?: 'decision' | 'scanning' | 'mls_tag' | 'returns_overdue' | 'discarded' | 'total';
  countTone?: 'muted' | 'warn' | 'danger';
};

const WORKFLOW: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: IconDashboard },
  { key: 'register', label: 'Intake register', href: null, icon: IconIntake, countFrom: 'total' },
  { key: 'decision', label: 'Decision queue', href: null, icon: IconDecision, countFrom: 'decision', countTone: 'warn' },
  { key: 'digitize', label: 'Digitize queue', href: null, icon: IconScan, countFrom: 'scanning' },
  { key: 'mls', label: 'MLS tagging queue', href: null, icon: IconTag, countFrom: 'mls_tag' },
  { key: 'returns', label: 'Return queue', href: null, icon: IconReturn, countFrom: 'returns_overdue', countTone: 'danger' },
  { key: 'discards', label: 'Discard log', href: null, icon: IconDiscard, countFrom: 'discarded' },
];

const ADMIN: NavItem[] = [
  { key: 'storage', label: 'Storage & sync', href: null, icon: IconStorage },
  { key: 'users', label: 'Users & roles', href: null, icon: IconUsers },
  { key: 'audit', label: 'Audit log', href: null, icon: IconClock },
];

const STORAGE_KEY = 'archive-tracker:rail-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read the stored preference after mount so the server and first client render agree.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* private mode or blocked storage — the default is fine */
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Both queries are already in flight for the dashboard itself; React Query dedupes,
  // so the rail costs no extra requests.
  const summary = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.summary,
  });
  const pipeline = useQuery({
    queryKey: queryKeys.dashboard.pipeline(),
    queryFn: dashboardApi.pipeline,
  });

  const stageCount = (stage: string) =>
    pipeline.data?.stages.find((s) => s.stage === stage)?.count;

  const countFor = (item: NavItem): string | undefined => {
    switch (item.countFrom) {
      case 'total':
        return summary.data ? num(summary.data.totalLotCount) : undefined;
      case 'decision':
      case 'scanning':
      case 'mls_tag':
      case 'discarded': {
        const c = stageCount(item.countFrom);
        return c === undefined ? undefined : num(c);
      }
      case 'returns_overdue': {
        const kpi = summary.data?.kpis.find((k) => k.key === 'returns_overdue');
        return kpi ? num(kpi.value) : undefined;
      }
      default:
        return undefined;
    }
  };

  const storage = summary.data?.storage;

  return (
    <nav
      aria-label="Primary"
      className={`${collapsed ? 'w-[76px]' : 'w-[248px]'} flex-shrink-0 bg-rail border-r border-rail-line flex flex-col transition-[width] duration-150`}
    >
      {/* Brand */}
      <div
        className={`h-[60px] flex-shrink-0 border-b border-rail-line flex items-center ${collapsed ? 'justify-center px-0' : 'px-4'}`}
      >
        <div
          className={`${collapsed ? 'w-[34px] h-[34px] text-[7px] rounded-[7px]' : 'flex-1 h-8 text-[8.5px] rounded-[6px]'} border border-dashed border-[#3A4353] bg-rail-raised flex items-center justify-center font-semibold tracking-[0.14em] text-rail-muted`}
          title="Replace with the official mark"
        >
          LOGO
        </div>
      </div>

      {/* Workspace switcher */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-2.5">
          <button
            type="button"
            className="w-full h-[46px] bg-rail-raised border border-[#242C38] rounded-[7px] px-2.5 flex items-center gap-2.5 cursor-pointer text-left"
          >
            <span className="w-[26px] h-[26px] flex-shrink-0 rounded-[5px] bg-accent text-white text-[10.5px] font-semibold flex items-center justify-center">
              SA
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-px">
              <span className="text-[12.5px] font-semibold text-[#E8EBF0] leading-[1.15]">
                Sarangpur Archive
              </span>
              <span className="text-[10px] text-rail-muted leading-[1.15]">
                Production workspace
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className={`flex flex-col gap-0.5 px-2.5 ${collapsed ? 'pt-3' : 'pt-0.5'}`}>
        <SectionLabel collapsed={collapsed}>Workflow</SectionLabel>
        {WORKFLOW.map((item) => (
          <NavRow
            key={item.key}
            item={item}
            collapsed={collapsed}
            active={item.href === pathname}
            count={countFor(item)}
          />
        ))}

        <div className="h-px bg-rail-line mx-1.5 mt-3 mb-1" />
        <SectionLabel collapsed={collapsed}>Administration</SectionLabel>
        {ADMIN.map((item) => (
          <NavRow key={item.key} item={item} collapsed={collapsed} active={false} />
        ))}
      </div>

      {/* Foot: live system state */}
      <div className="mt-auto border-t border-rail-line px-3 pt-3.5 pb-3 flex flex-col gap-3">
        {!collapsed && (
          <div className="flex flex-col gap-2.5 px-1">
            <div className="flex items-center gap-2.5">
              <span className="w-[7px] h-[7px] rounded-full bg-[#34A06A] shadow-[0_0_0_3px_rgba(52,160,106,0.18)] flex-shrink-0" />
              <span className="text-[11.5px] font-semibold text-rail-text-strong">
                MLS reachable
              </span>
            </div>
            <div className="font-mono text-[10px] text-rail-muted leading-relaxed break-all">
              192.168.0.84/MLS/dev/
            </div>
            <div className="h-px bg-rail-line" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-rail-text-strong">
                  Archive storage
                </span>
                <span className="ml-auto text-[10.5px] text-rail-muted tnum">
                  {storage ? `${storage.usedTb} / ${storage.capacityTb} TB` : '—'}
                </span>
              </div>
              <div className="h-[5px] rounded-full bg-rail-active overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-bright transition-[width] duration-300"
                  style={{ width: `${storage?.percent ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`${collapsed ? 'w-9 h-9 justify-center self-center p-0' : 'h-9 px-2.5 gap-2.5'} bg-transparent border border-rail-control rounded-[6px] text-rail-text text-[12px] font-medium cursor-pointer flex items-center`}
        >
          <IconCollapse size={15} className={collapsed ? 'rotate-180' : ''} />
          {!collapsed && <span className="flex-1 text-left">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}

function SectionLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: string;
}) {
  if (collapsed) return <div className="h-px bg-rail-line mx-2 my-2.5" />;
  return (
    <div className="px-1.5 pt-2 pb-1.5 text-[9.5px] font-semibold tracking-[0.12em] uppercase text-rail-muted">
      {children}
    </div>
  );
}

function NavRow({
  item,
  collapsed,
  active,
  count,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  count?: string;
}) {
  const Icon = item.icon;

  const base = `flex items-center gap-2.5 h-[38px] rounded-[6px] text-[13px] box-border ${
    collapsed ? 'px-0 justify-center' : 'px-2.5'
  }`;
  const tone = active
    ? 'bg-rail-active text-white font-semibold'
    : item.href
      ? 'text-rail-text font-medium hover:bg-rail-raised hover:text-rail-text-strong'
      : 'text-rail-text font-medium opacity-60 cursor-not-allowed';

  const countClass =
    item.countTone === 'warn'
      ? 'text-[10.5px] font-semibold text-[#E8C07A] bg-[rgba(122,82,17,0.34)] rounded-full px-1.5 py-0.5'
      : item.countTone === 'danger'
        ? 'text-[10.5px] font-semibold text-[#F0A9A9] bg-[rgba(155,44,44,0.3)] rounded-full px-1.5 py-0.5'
        : 'text-[11px] font-medium text-rail-muted';

  const body = (
    <>
      <Icon size={17} className={`flex-shrink-0 ${active ? 'text-accent-tint' : ''}`} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && count !== undefined && (
        <span className={`${countClass} tnum`}>{count}</span>
      )}
    </>
  );

  if (!item.href) {
    return (
      <button
        type="button"
        disabled
        title="Not in this MVP slice yet"
        className={`${base} ${tone} bg-transparent border-0 w-full text-left`}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${tone} no-underline`}
      title={collapsed ? item.label : undefined}
    >
      {body}
    </Link>
  );
}
