import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DigitizeQueueManager } from '@/components/lots/DigitizeQueueManager';

export const metadata: Metadata = { title: 'Digitization queue · Archive Tracker' };

export default function DigitizeQueuePage() {
  return (
    <Suspense fallback={null}>
      <DigitizeQueueManager />
    </Suspense>
  );
}
