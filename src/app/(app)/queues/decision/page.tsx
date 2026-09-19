import type { Metadata } from 'next';
import { DecisionQueueManager } from '@/components/lots/DecisionQueueManager';

export const metadata: Metadata = { title: 'Decision queue · Archive Tracker' };

export default function DecisionQueuePage() {
  return <DecisionQueueManager />;
}
