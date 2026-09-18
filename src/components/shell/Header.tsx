'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  IconBell,
  IconChevronDown,
  IconMenu,
  IconPlus,
  IconRefresh,
  IconSearch,
} from '@/components/ui/icons';
import { useDrawer } from '@/components/shell/drawer-context';

const CURRENT_USER = { name: 'M. Patel', role: 'Volunteer', initials: 'MP' };

export function Header({ section, page }: { section: string; page: string }) {
  const queryClient = useQueryClient();
  const { toggle } = useDrawer();

  const alerts = useQuery({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: dashboardApi.alerts,
  });

  const openAlerts = alerts.data?.totalOpen ?? 0;

  const refreshAll = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });

  return (
    <header className="h-[60px] flex-shrink-0 bg-surface border-b border-line flex items-center gap-2.5 px-3 md:gap-4 md:px-5">
      {/* Hamburger — visible only on mobile */}
      <button
        type="button"
        onClick={toggle}
        className="xl:hidden w-10 h-10 flex items-center justify-center rounded-[6px] text-ink-2 cursor-pointer"
        aria-label="Open navigation"
      >
        <IconMenu size={20} />
      </button>

      {/* Page locator */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[9.5px] font-semibold tracking-[0.12em] uppercase text-ink-4 hidden sm:block">
          {section}
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-ink truncate">
          {page}
        </span>
      </div>

      {/* Search bar — full on lg+, icon-only on md, hidden on < md */}
      <button
        type="button"
        className="ml-2 hidden lg:flex w-[392px] h-10 bg-surface-sunken border border-line rounded-[6px] pl-3 pr-2.5 items-center gap-2.5 cursor-pointer"
        title="Command palette — not wired up in this slice"
      >
        <IconSearch size={15} className="flex-shrink-0 text-ink-4" />
        <span className="flex-1 text-left text-[13px] text-ink-4">
          Search lots, codes, people, paths…
        </span>
        <span className="flex gap-[3px] flex-shrink-0">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* Compact search — md only */}
      <button
        type="button"
        className="hidden md:flex lg:hidden w-10 h-10 bg-surface-sunken border border-line rounded-[6px] items-center justify-center cursor-pointer ml-auto"
        title="Search"
      >
        <IconSearch size={16} className="text-ink-4" />
      </button>

      <div className="flex items-center gap-2 md:gap-2.5 ml-auto md:ml-2">
        {/* New intake — full on md+, icon-only on sm, hidden on < sm */}
        <button
          type="button"
          className="hidden sm:inline-flex h-10 px-[15px] bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[13px] font-semibold items-center gap-2 cursor-pointer"
          title="Intake form arrives in the next slice"
        >
          <IconPlus size={15} />
          <span className="hidden md:inline">New intake</span>
        </button>

        <span className="hidden sm:block w-px h-[26px] bg-line" />

        <button
          type="button"
          onClick={refreshAll}
          aria-label="Refresh dashboard data"
          title="Refresh"
          className="w-10 h-10 bg-surface border border-line rounded-[6px] shadow-control text-ink-2 flex items-center justify-center cursor-pointer"
        >
          <IconRefresh size={16} />
        </button>

        <button
          type="button"
          aria-label={`Alerts, ${openAlerts} open`}
          className="relative w-10 h-10 bg-surface border border-line rounded-[6px] shadow-control text-ink-2 flex items-center justify-center cursor-pointer"
        >
          <IconBell size={17} />
          {openAlerts > 0 && (
            <span className="absolute -top-[5px] -right-[5px] min-w-[17px] h-[17px] px-1 box-border bg-danger-mark border-2 border-surface rounded-full text-white text-[9.5px] font-semibold leading-[13px] text-center tnum">
              {openAlerts}
            </span>
          )}
        </button>

        {/* User button — initials on sm, full on md+ */}
        <button
          type="button"
          className="h-11 pl-1.5 pr-2.5 bg-surface border border-line rounded-[7px] shadow-control flex items-center gap-2.5 cursor-pointer"
        >
          <span className="w-[30px] h-[30px] rounded-[6px] bg-[#1C2431] text-white text-[11.5px] font-semibold flex items-center justify-center">
            {CURRENT_USER.initials}
          </span>
          <span className="hidden md:flex flex-col gap-px text-left">
            <span className="text-[12.5px] font-semibold text-ink leading-[1.15]">
              {CURRENT_USER.name}
            </span>
            <span className="text-[10px] text-ink-4 leading-[1.15]">{CURRENT_USER.role}</span>
          </span>
          <IconChevronDown size={13} className="hidden md:block text-ink-4" />
        </button>
      </div>
    </header>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="font-sans text-[10.5px] font-semibold text-ink-3 bg-surface border border-line-strong rounded-[4px] px-[5px] py-0.5 leading-[1.2]">
      {children}
    </kbd>
  );
}
