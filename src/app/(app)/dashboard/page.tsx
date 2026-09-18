import type { Metadata } from 'next';
import { Header } from '@/components/shell/Header';
import { PageHeading } from '@/components/dashboard/PageHeading';
import { KpiRow } from '@/components/dashboard/KpiRow';
import { PipelineBoard } from '@/components/dashboard/PipelineBoard';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';

export const metadata: Metadata = {
  title: 'Dashboard — Archive Tracker',
};

export default function DashboardPage() {
  return (
    <>
      <Header section="Workflow" page="Dashboard" />

      <main className="flex-1 min-h-0 overflow-auto px-6 pt-[22px] pb-6 flex flex-col gap-5">
        <PageHeading />
        <KpiRow />
        <PipelineBoard />
        <div className="flex-1 min-h-[320px] flex gap-4">
          <AlertsPanel />
          <ActivityFeed />
        </div>
      </main>
    </>
  );
}
