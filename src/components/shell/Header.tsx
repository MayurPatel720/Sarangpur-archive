'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { IconBell, IconChevronDown, IconPlus, IconRefresh, IconSearch } from '@/components/ui/icons';

/**
 * The application header. Sits to the right of the full-height rail, so it carries the
 * page locator rather than the brand.
 *
 * The signed-in user is hardcoded for this slice — authentication is the next one.
 */
const CURRENT_USER = { name: 'M. Patel', role: 'Volunteer', initials: 'MP' };

export function Header({ section, page }: { section: string; page: string }) {
  const queryClient = useQueryClient();

  const alerts = useQuery({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: dashboardApi.alerts,
  });

  const openAlerts = alerts.data?.totalOpen ?? 0;

  const refreshAll = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });

  return (
    <header className="h-[60px] flex-shrink-0 bg-surface border-b border-line flex items-center gap-4 px-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9.5px] font-semibold tracking-[0.12em] uppercase text-ink-4">
          {section}
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-ink">{page}</span>
      </div>

      <button
        type="button"
        className="ml-2.5 w-[392px] h-10 bg-surface-sunken border border-line rounded-[6px] pl-3 pr-2.5 flex items-center gap-2.5 cursor-pointer"
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

      <div className="flex items-center gap-2.5 ml-auto">
        <button
          type="button"
          className="h-10 px-[15px] bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[13px] font-semibold flex items-center gap-2 cursor-pointer"
          title="Intake form arrives in the next slice"
        >
          <IconPlus size={15} />
          New intake
        </button>

        <span className="w-px h-[26px] bg-line" />

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

        <button
          type="button"
          className="h-11 pl-1.5 pr-2.5 bg-surface border border-line rounded-[7px] shadow-control flex items-center gap-2.5 cursor-pointer"
        >
          <span className="w-[30px] h-[30px] rounded-[6px] bg-[#1C2431] text-white text-[11.5px] font-semibold flex items-center justify-center">
            {CURRENT_USER.initials}
          </span>
          <span className="flex flex-col gap-px text-left">
            <span className="text-[12.5px] font-semibold text-ink leading-[1.15]">
              {CURRENT_USER.name}
            </span>
            <span className="text-[10px] text-ink-4 leading-[1.15]">{CURRENT_USER.role}</span>
          </span>
          <IconChevronDown size={13} className="text-ink-4" />
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
