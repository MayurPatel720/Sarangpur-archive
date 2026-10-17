import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrasadiChecksPanel } from '@/components/lots/PrasadiChecksPanel';

export const metadata: Metadata = { title: 'Prasadi checks · Archive Tracker' };

export default function PrasadiChecksPage() {
  return (
    <Suspense fallback={null}>
      <div className="flex flex-col gap-4 md:gap-5">
        <PrasadiChecksPanel />
      </div>
    </Suspense>
  );
}
