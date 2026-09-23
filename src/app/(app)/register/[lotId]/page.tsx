import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LotDetail } from '@/components/lots/LotDetail';

export const metadata: Metadata = {
  title: 'Lot record — Archive Tracker',
};

export default async function LotRecordPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  return (
    <Suspense fallback={null}>
      <LotDetail lotId={lotId} />
    </Suspense>
  );
}
