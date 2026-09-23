import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { DrawerProvider } from '@/components/shell/drawer-context';
import { DrawerBackdrop } from '@/components/shell/DrawerBackdrop';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * The application shell: a full-height graphite rail, and everything else to its right.
 * The header lives inside each page so it can carry that page's locator.
 *
 * On mobile (< xl) the sidebar becomes a slide-over drawer with a backdrop overlay.
 * Sidebar uses useSearchParams for media filter active state → Suspense boundary.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DrawerProvider>
        <div className="h-screen flex bg-canvas text-ink">
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
          <div className="flex-1 min-w-0 flex flex-col">{children}</div>
          <DrawerBackdrop />
        </div>
      </DrawerProvider>
    </ToastProvider>
  );
}
