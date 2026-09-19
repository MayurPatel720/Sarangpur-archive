import type { Metadata } from 'next';
import { DiscardsQueueManager } from '@/components/lots/DiscardsQueueManager';

export const metadata: Metadata = { title: 'Discards · Archive Tracker' };

export default function DiscardsQueuePage() {
  return <DiscardsQueueManager />;
}
