import type { ReactNode } from 'react';
import { Header } from '@/components/shell/Header';

export default function AlertsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header section="Archive" page="Alerts" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-clip px-3 md:px-6 pt-4 md:pt-[22px] pb-4 md:pb-6">
        {children}
      </main>
    </>
  );
}
