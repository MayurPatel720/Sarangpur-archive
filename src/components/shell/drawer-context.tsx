'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface DrawerCtx {
  /** Mobile drawer open state */
  open: boolean;
  toggle: () => void;
  close: () => void;

  /** Desktop sidebar collapsed state (independent of mobile drawer) */
  collapsed: boolean;
  toggleCollapse: () => void;
}

const Ctx = createContext<DrawerCtx>({
  open: false,
  toggle() {},
  close() {},
  collapsed: true,
  toggleCollapse() {},
});

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Collapsed by default: the rail + hover-preview is the primary desktop mode.
  const [collapsed, setCollapsed] = useState(true);
  const pathname = usePathname();

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

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), []);

  return (
    <Ctx.Provider value={{ open, toggle, close, collapsed, toggleCollapse }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDrawer() {
  return useContext(Ctx);
}
