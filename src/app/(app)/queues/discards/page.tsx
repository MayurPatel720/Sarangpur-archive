import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DiscardsQueueManager } from '@/components/lots/DiscardsQueueManager';
import { ItemDispositionsPanel } from '@/components/lots/ItemDispositionsPanel';

export const metadata: Metadata = { title: 'Discards · Archive Tracker' };

export default function DiscardsQueuePage() {
  return (
    <Suspense fallback={null}>
      <div className="flex flex-col gap-4 md:gap-5">
        <DiscardsQueueManager />
        <ItemDispositionsPanel kind="discard" />
      </div>
    </Suspense>
  );
}
