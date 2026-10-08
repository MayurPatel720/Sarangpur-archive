import type { Metadata } from 'next';
import { Header } from '@/components/shell/Header';
import { FormatBlocks } from '@/components/dashboard/FormatBlocks';
import { CreateProjectButton } from '@/components/dashboard/CreateProjectButton';

export const metadata: Metadata = {
  title: 'Main dashboard — Archive Tracker',
};

/**
 * Main dashboard: the format picker, now inside the app shell (sidebar + header). Each
 * block opens /dashboard/[format]. Counts are filtered server-side by the caller's
 * `format:*` grants; locked formats render disabled with no numbers. The header's format
 * dropdown switches format from anywhere, so this screen is a start page, not a gate.
 */
export default function MainDashboardPage() {
  return (
    <>
      <Header page="Main dashboard" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-clip px-3 md:px-6 pt-4 md:pt-[22px] pb-4 md:pb-6">
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 md:gap-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
            <div className="flex flex-col gap-1.5 min-w-0">
              <h1 className="m-0 text-[20px] sm:text-[24px] font-semibold tracking-[-0.022em] text-ink">
                Choose a media format
              </h1>
              <p className="m-0 text-[12.5px] text-ink-3">
                Open a block to work its dashboard, queues and alerts — every number stays inside
                that format.
              </p>
            </div>
            <div className="sm:ml-auto">
              <CreateProjectButton />
            </div>
          </div>
          <FormatBlocks />
        </div>
      </main>
    </>
  );
}
