import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AlertsManager } from '@/components/dashboard/AlertsManager';

export const metadata: Metadata = {
  title: 'Alerts & escalations — Archive Tracker',
};

export default function AlertsPage() {
  // Suspense: AlertsManager reads ?format= via useSearchParams.
  return (
    <Suspense fallback={null}>
      <AlertsManager />
    </Suspense>
  );
}
