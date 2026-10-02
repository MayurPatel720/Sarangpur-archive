import type { Metadata } from 'next';
import { FormatBlocks } from '@/components/dashboard/FormatBlocks';

export const metadata: Metadata = {
  title: 'Choose a format — Archive Tracker',
};

/**
 * The format-block chooser: the one screen between login and the dashboards.
 * Deliberately bare — no sidebar, no header, no dashboard furniture. Each
 * block opens /dashboard/[format], which carries the full app shell scoped
 * to that format. Counts are filtered server-side by the caller's
 * `format:*` grants; locked formats render disabled with no numbers.
 */
export default function DashboardPickerPage() {
  return (
    <main className="min-h-screen bg-canvas text-ink flex flex-col justify-center px-4 sm:px-6 md:px-10 py-10">
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 md:gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[20px] sm:text-[24px] font-semibold tracking-[-0.022em] text-ink">
            Choose a media format
          </h1>
          <p className="m-0 text-[12.5px] text-ink-3">
            Open a block to work its dashboard, queues and alerts — every number stays inside
            that format.
          </p>
        </div>
        <FormatBlocks />
      </div>
    </main>
  );
}
