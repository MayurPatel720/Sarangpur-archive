import type { Metadata } from 'next';
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
  return <LotDetail lotId={lotId} />;
}
