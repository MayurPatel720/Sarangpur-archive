'use client';

import { useDrawer } from '@/components/shell/drawer-context';

/** Dark backdrop behind the sidebar drawer — only rendered on mobile when open. */
export function DrawerBackdrop() {
  const { open, close } = useDrawer();

  return (
    <div
      className={[
        'fixed inset-0 bg-black/40 z-40 xl:hidden transition-opacity duration-300',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
      onClick={close}
      aria-hidden="true"
    />
  );
}
