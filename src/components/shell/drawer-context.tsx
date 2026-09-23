'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SIDEBAR_COLLAPSED_KEY } from '@/lib/shell';

interface DrawerCtx {
  /** Mobile drawer open state */
  open: boolean;
  toggle: () => void;
  close: () => void;

  /**
   * Desktop sidebar collapsed state (independent of mobile drawer).
   * Always `false` until the preference has been restored after mount so SSR
   * and the first client render agree (Sidebar sits behind Suspense).
   */
  collapsed: boolean;
  /** True once localStorage has been applied — consumers can wait on this. */
  railReady: boolean;
  toggleCollapse: () => void;
}

const Ctx = createContext<DrawerCtx>({
  open: false,
  toggle() {},
  close() {},
  collapsed: false,
  railReady: false,
  toggleCollapse() {},
});

function readCollapsedPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Expanded on the server and on the first client render; preference applies in an effect.
  const [collapsed, setCollapsed] = useState(false);
  const [railReady, setRailReady] = useState(false);
  const restored = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setCollapsed(readCollapsedPref());
    setRailReady(true);
  }, []);

  // Close drawer on route change (mobile nav)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Escape dismisses the mobile drawer (desktop rail has no overlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  const toggleCollapse = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        /* private mode — still apply for this session */
      }
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ open, toggle, close, collapsed, railReady, toggleCollapse }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDrawer() {
  return useContext(Ctx);
}
