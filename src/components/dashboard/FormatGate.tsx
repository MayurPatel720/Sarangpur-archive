'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useMe } from '@/hooks/useCan';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { IconChevronLeft, IconLock } from '@/components/ui/icons';

/**
 * Client-side guard for a format dashboard: while grants load, a skeleton; with
 * no `format:*` grant, a "No access" panel instead of the panels below (the API
 * would 403 anyway — this keeps the denial calm and explains why).
 */
export function FormatGate({ format, children }: { format: Format; children: ReactNode }) {
  const { data, isPending, error } = useMe();

  if (isPending) {
    return (
      <>
        <Panel className="px-4 pt-[15px] pb-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-56 mt-2" />
        </Panel>
        <Panel className="px-4 py-4">
          <Skeleton className="h-4 w-full" />
        </Panel>
      </>
    );
  }

  if (error) {
    const e = error as { message: string; hint?: string };
    return (
      <Panel>
        <ErrorState message={e.message} hint={e.hint} />
      </Panel>
    );
  }

  const granted = data ? data.grants.includes(`format:${format}`) : false;
  if (!granted) {
    return (
      <Panel className="px-6 py-10 flex flex-col items-center gap-3 text-center">
        <span className="w-11 h-11 rounded-[8px] bg-warn-bg text-warn flex items-center justify-center">
          <IconLock size={19} />
        </span>
        <h2 className="m-0 text-[15px] font-semibold text-ink">No access</h2>
        <p className="m-0 text-[12.5px] text-ink-3 max-w-[46ch]">
          Your role does not include <span className="font-mono">format:{format}</span>, so the{' '}
          {FORMAT_LABELS[format]} block and its dashboard are closed. Ask an admin for the grant
          in Admin → Roles.
        </p>
        <Link
          href="/dashboard"
          className="mt-1 text-[12.5px] font-semibold text-accent no-underline hover:underline flex items-center gap-1"
        >
          <IconChevronLeft size={13} />
          Back to all formats
        </Link>
      </Panel>
    );
  }

  return <>{children}</>;
}
