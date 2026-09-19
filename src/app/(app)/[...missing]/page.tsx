import Link from 'next/link';
import { Panel } from '@/components/ui/primitives';

/**
 * Placeholder for every section that has a sidebar link but no module yet
 * (register, decision, digitize, MLS, storage, returns, discards, admin, media
 * browse views). Each module replaces its slice of this page with real screens.
 * Exact routes (like /dashboard) take precedence over this catch-all, so it only
 * renders for genuinely unbuilt sections — never for API routes or /login.
 */

const SECTION_LABELS: Record<string, string> = {
  register: 'Register',
  decision: 'Decision queue',
  digitize: 'Digitization queue',
  mls: 'MLS tagging',
  storage: 'Storage',
  returns: 'Returns',
  discards: 'Discards',
  photos: 'Photos',
  videos: 'Videos',
  audio: 'Audio',
  admin: 'Admin',
};

export default async function SoonPage({
  params,
}: {
  params: Promise<{ missing: string[] }>;
}) {
  const { missing } = await params;
  const section = SECTION_LABELS[missing[0] ?? ''] ?? 'This section';

  return (
    <div className="px-3 pt-4 pb-4 md:px-6 md:pt-[22px] md:pb-6">
      <Panel>
        <div className="flex flex-col items-center px-4 py-14 text-center md:py-20">
          <p className="font-mono text-[12px] tracking-[0.14em] text-ink-3 uppercase">
            Not built yet
          </p>
          <h1 className="mt-2 text-[20px] font-semibold text-ink sm:text-[22px]">
            {section} is coming soon
          </h1>
          <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-ink-2">
            The dashboard on this server is live, and this module is next in the build
            order. Nothing here is broken — there is simply nothing to show yet.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Back to dashboard
          </Link>
        </div>
      </Panel>
    </div>
  );
}
