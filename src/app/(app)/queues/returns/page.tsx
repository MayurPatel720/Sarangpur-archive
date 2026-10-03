import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReturnsQueueManager } from '@/components/lots/ReturnsQueueManager';
import { ItemDispositionsPanel } from '@/components/lots/ItemDispositionsPanel';

export const metadata: Metadata = { title: 'Returns queue · Archive Tracker' };

export default function ReturnsQueuePage() {
  return (
    <Suspense fallback={null}>
      <div className="flex flex-col gap-4 md:gap-5">
        <ReturnsQueueManager />
        <ItemDispositionsPanel kind="return" />
      </div>
    </Suspense>
  );
}
