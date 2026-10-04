import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FORMATS, FORMAT_LABELS, type Format } from '@/lib/domain';
import { Header } from '@/components/shell/Header';
import { FormatGate } from '@/components/dashboard/FormatGate';
import { PageHeading } from '@/components/dashboard/PageHeading';
import { KpiRow } from '@/components/dashboard/KpiRow';
import { TodaysTasks } from '@/components/tasks/TodaysTasks';
import { PipelineBoard } from '@/components/dashboard/PipelineBoard';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';

function asFormat(value: string): Format | null {
  return (FORMATS as readonly string[]).includes(value) ? (value as Format) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ format: string }>;
}): Promise<Metadata> {
  const { format } = await params;
  const known = asFormat(format);
  return { title: known ? `${FORMAT_LABELS[known]} dashboard — Archive Tracker` : 'Not found' };
}

export default async function FormatDashboardPage({
  params,
}: {
  params: Promise<{ format: string }>;
}) {
  const { format } = await params;
  const known = asFormat(format);
  if (!known) notFound();

  return (
    <>
      <Header page="Dashboard" />

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-clip px-3 md:px-6 pt-4 md:pt-[22px] pb-4 md:pb-6 flex flex-col gap-4 md:gap-5">
        <FormatGate format={known}>
          <PageHeading format={known} />
          <KpiRow format={known} />
          <TodaysTasks format={known} />
          <PipelineBoard format={known} />
          <div className="flex-1 min-h-[200px] lg:min-h-[320px] flex flex-col lg:flex-row gap-4">
            <AlertsPanel format={known} />
            <ActivityFeed format={known} />
          </div>
        </FormatGate>
      </main>
    </>
  );
}
