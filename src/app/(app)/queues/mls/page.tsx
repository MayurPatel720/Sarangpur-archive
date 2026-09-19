import type { Metadata } from 'next';
import { MlsQueueManager } from '@/components/lots/MlsQueueManager';

export const metadata: Metadata = { title: 'MLS tagging queue · Archive Tracker' };

export default function MlsQueuePage() {
  return <MlsQueueManager />;
}
