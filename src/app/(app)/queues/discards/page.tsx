import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DiscardsQueueManager } from '@/components/lots/DiscardsQueueManager';

export const metadata: Metadata = { title: 'Discards · Archive Tracker' };

export default function DiscardsQueuePage() {
  return (
    <Suspense fallback={null}>
      <DiscardsQueueManager />
    </Suspense>
  );
}
