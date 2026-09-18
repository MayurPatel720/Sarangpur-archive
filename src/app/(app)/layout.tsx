import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { DrawerProvider } from '@/components/shell/drawer-context';
import { DrawerBackdrop } from '@/components/shell/DrawerBackdrop';

/**
 * The application shell: a full-height graphite rail, and everything else to its right.
 * The header lives inside each page so it can carry that page's locator.
 *
 * On mobile (< xl) the sidebar becomes a slide-over drawer with a backdrop overlay.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DrawerProvider>
      <div className="h-screen flex bg-canvas text-ink">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
        <DrawerBackdrop />
      </div>
    </DrawerProvider>
  );
}
