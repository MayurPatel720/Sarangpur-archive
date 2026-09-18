import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';

/**
 * The application shell: a full-height graphite rail, and everything else to its right.
 * The header lives inside each page so it can carry that page's locator.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex bg-canvas text-ink">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
