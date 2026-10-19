import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReturnsBoard } from '@/components/returns/ReturnsBoard';

export const metadata: Metadata = { title: 'Returns · Archive Tracker' };

export default function ReturnsQueuePage() {
  return (
    <Suspense fallback={null}>
      <ReturnsBoard />
    </Suspense>
  );
}
