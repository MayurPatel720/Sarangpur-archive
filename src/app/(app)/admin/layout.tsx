import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/shell/Header';
import { AdminTabs } from '@/components/admin/AdminTabs';

export const metadata: Metadata = {
  title: 'Admin — Archive Tracker',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header section="Manage" page="Admin" />

      <main className="flex-1 min-h-0 overflow-auto px-3 md:px-6 pt-4 md:pt-[22px] pb-4 md:pb-6 flex flex-col gap-4 md:gap-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
              Administration
            </h1>
            <p className="m-0 text-[12.5px] text-ink-3">
              Users, roles, vocabularies and archive settings.
            </p>
          </div>
          <div className="sm:ml-auto">
            <AdminTabs />
          </div>
        </div>
        {children}
      </main>
    </>
  );
}
