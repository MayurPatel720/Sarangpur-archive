import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MachinesManager } from '@/components/machines/MachinesManager';

export const metadata: Metadata = { title: 'Machines — Archive Tracker' };

export default function MachinesPage() {
  return (
    <Suspense fallback={null}>
      <MachinesManager />
    </Suspense>
  );
}
