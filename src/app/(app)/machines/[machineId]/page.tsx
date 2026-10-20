import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MachineDetail } from '@/components/machines/MachineDetail';

export const metadata: Metadata = { title: 'Machine — Archive Tracker' };

export default async function MachinePage({ params }: { params: Promise<{ machineId: string }> }) {
  const { machineId } = await params;
  return (
    <Suspense fallback={null}>
      <MachineDetail machineId={machineId} />
    </Suspense>
  );
}
