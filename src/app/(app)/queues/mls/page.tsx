import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MlsQueueManager } from '@/components/lots/MlsQueueManager';

export const metadata: Metadata = { title: 'MLS tagging queue · Archive Tracker' };

export default function MlsQueuePage() {
  return (
    <Suspense fallback={null}>
      <MlsQueueManager />
    </Suspense>
  );
}
