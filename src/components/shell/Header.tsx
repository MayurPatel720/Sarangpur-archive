'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { THEME_OPTIONS, useTheme } from '@/hooks/useTheme';
import {
  IconBell,
  IconChevronDown,
  IconMenu,
  IconRefresh,
  IconSearch,
} from '@/components/ui/icons';
import { useDrawer } from '@/components/shell/drawer-context';
import { SearchOverlay } from '@/components/shell/SearchOverlay';
import { Kbd } from '@/components/ui/Kbd';

/** 'lead_reviewer' → 'Lead reviewer'. Session only carries the key, not the label. */
function prettifyRoleKey(key: string): string {
  return key
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** 'M. Patel' → 'MP'. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const initials = parts.map((p) => p[0]!.toUpperCase()).join('');
  return initials || '–';
}

/** ⌘ on Apple platforms, Ctrl elsewhere — for the search hint badge. */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function Header({ page }: { page: string }) {
  const queryClient = useQueryClient();
  const { toggle } = useDrawer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();

  const displayName = me?.name ?? '';
  const roleLabel = me ? prettifyRoleKey(me.roleKey) : '';
  const initials = me ? initialsOf(me.name) : '';

  const alerts = useQuery({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: dashboardApi.alerts,
  });

  const openAlerts = alerts.data?.totalOpen ?? 0;

  // Page-agnostic: refetch everything (dashboard + admin + session), not just dashboard.
  const refreshAll = () => queryClient.invalidateQueries();

  // Global ⌘/Ctrl+K opens the search overlay (Spotlight convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const searchKeys = isApplePlatform() ? (['⌘', 'K'] as const) : (['Ctrl', 'K'] as const);
  const searchHint = searchKeys.join(' ');

  return (
    <header className="relative h-[60px] flex-shrink-0 bg-surface border-b border-line flex items-center gap-2.5 px-3 md:gap-4 md:px-5">
      {/* Hamburger — visible only on mobile */}
      <button
        type="button"
        onClick={toggle}
        className="xl:hidden w-10 h-10 flex items-center justify-center rounded-[6px] text-ink-2 cursor-pointer z-10"
        aria-label="Open navigation"
      >
        <IconMenu size={20} />
      </button>

      {/* Page locator */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-shrink-0 relative z-10">
        <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-ink truncate">
          {page}
        </span>
      </div>

      {/* Search — absolute center of the header (main column, excludes sidebar) */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(100%-1.5rem,560px)] h-10 bg-surface-sunken border border-line rounded-[6px] pl-3 pr-2.5 items-center gap-2.5 cursor-pointer z-0"
        title={`Search (${searchHint})`}
        aria-label={`Open search (${searchHint})`}
      >
        <IconSearch size={15} className="flex-shrink-0 text-ink-4" />
        <span className="flex-1 text-left text-[13px] text-ink-4">
          Search lots, codes, people, paths…
        </span>
        <span className="flex-shrink-0">
          <Kbd keys={searchKeys} label={searchHint} />
        </span>
      </button>

      {/* Compact search — md only */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden md:flex lg:hidden w-10 h-10 bg-surface-sunken border border-line rounded-[6px] items-center justify-center cursor-pointer ml-auto relative z-10"
        title="Search"
        aria-label="Open search"
      >
        <IconSearch size={16} className="text-ink-4" />
      </button>

      {/* Utility cluster — flush right on desktop (lg:ml-auto restores the
          auto-margin that md:ml-2 overrides). */}
      <div className="flex items-center gap-2 md:gap-2.5 ml-auto md:ml-2 lg:ml-auto relative z-10">
        <button
          type="button"
          onClick={refreshAll}
          aria-label="Refresh data"
          title="Refresh"
          className="w-10 h-10 bg-surface border border-line rounded-[6px] shadow-control text-ink-2 flex items-center justify-center cursor-pointer"
        >
          <IconRefresh size={16} />
        </button>

        <a
          href="/alerts"
          aria-label={`Alerts, ${openAlerts} open`}
          className="relative w-10 h-10 bg-surface border border-line rounded-[6px] shadow-control text-ink-2 flex items-center justify-center cursor-pointer"
        >
          <IconBell size={17} />
          {openAlerts > 0 && (
            <span className="absolute -top-[5px] -right-[5px] min-w-[17px] h-[17px] px-1 box-border bg-danger-mark border-2 border-surface rounded-full text-white text-[9.5px] font-semibold leading-[13px] text-center tnum">
              {openAlerts}
            </span>
          )}
        </a>

        {/* User button + dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={displayName || 'Account'}
            className="h-11 pl-1.5 pr-2.5 bg-surface border border-line rounded-[7px] shadow-control flex items-center gap-2.5 cursor-pointer"
          >
            <span className="w-[30px] h-[30px] rounded-[6px] bg-strong-bg text-on-strong text-[11.5px] font-semibold flex items-center justify-center">
              {initials}
            </span>
            <span className="hidden md:flex flex-col gap-px text-left">
              <span className="text-[12.5px] font-semibold text-ink leading-[1.15]">
                {displayName}
              </span>
              <span className="text-[10px] text-ink-4 leading-[1.15]">{roleLabel}</span>
            </span>
            <IconChevronDown size={13} className="hidden md:block text-ink-4" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close account menu"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0"
              />
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-[8px] border border-line bg-surface shadow-control p-1.5"
              >
                <div className="px-2.5 py-2">
                  <div className="text-[12.5px] font-semibold text-ink truncate">
                    {displayName}
                  </div>
                  <div className="text-[11px] text-ink-4">{roleLabel}</div>
                </div>
                <div className="h-px bg-line mx-1.5 my-1" />
                <div className="px-2.5 pt-1.5 pb-1">
                  <div
                    id="account-theme-label"
                    className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-ink-4 mb-1.5"
                  >
                    Theme
                  </div>
                  <div
                    role="group"
                    aria-labelledby="account-theme-label"
                    className="grid grid-cols-3 gap-1 bg-surface-sunken border border-line rounded-[6px] p-0.5"
                  >
                    {THEME_OPTIONS.map((opt) => {
                      const active = theme === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => setTheme(opt.value)}
                          className={`h-7 rounded-[4px] text-[11.5px] font-medium cursor-pointer border-0 ${
                            active
                              ? 'bg-strong-bg text-on-strong'
                              : 'bg-transparent text-ink-2 hover:text-ink'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="h-px bg-line mx-1.5 my-1" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut({ callbackUrl: '/login' })}
                  className="w-full text-left px-2.5 py-2 rounded-[6px] text-[12.5px] font-medium text-ink hover:bg-surface-sunken cursor-pointer border-0 bg-transparent"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
