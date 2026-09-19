import type { Metadata } from 'next';
import { AlertsManager } from '@/components/dashboard/AlertsManager';

export const metadata: Metadata = {
  title: 'Alerts & escalations — Archive Tracker',
};

export default function AlertsPage() {
  return <AlertsManager />;
}
