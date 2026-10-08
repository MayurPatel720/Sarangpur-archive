import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Header } from '@/components/shell/Header';
import { MasterExcel } from '@/components/master/MasterExcel';

export const metadata: Metadata = {
  title: 'Master Excel — Archive Tracker',
};

/** Every item of every lot with its lot and project — one filterable, exportable sheet. */
export default function MasterExcelPage() {
  return (
    <>
      <Header page="Master Excel" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-clip px-3 md:px-6 pt-4 md:pt-[22px] pb-4 md:pb-6">
        <Suspense fallback={null}>
          <MasterExcel />
        </Suspense>
      </main>
    </>
  );
}
