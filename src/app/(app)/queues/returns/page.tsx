import type { Metadata } from 'next';
import { ReturnsQueueManager } from '@/components/lots/ReturnsQueueManager';

export const metadata: Metadata = { title: 'Returns queue · Archive Tracker' };

export default function ReturnsQueuePage() {
  return <ReturnsQueueManager />;
}
