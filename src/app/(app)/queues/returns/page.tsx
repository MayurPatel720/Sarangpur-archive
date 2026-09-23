import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReturnsQueueManager } from '@/components/lots/ReturnsQueueManager';

export const metadata: Metadata = { title: 'Returns queue · Archive Tracker' };

export default function ReturnsQueuePage() {
  return (
    <Suspense fallback={null}>
      <ReturnsQueueManager />
    </Suspense>
  );
}
