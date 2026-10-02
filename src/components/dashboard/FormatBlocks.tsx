'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { num } from '@/lib/format';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import {
  IconBox,
  IconClipboardList,
  IconFileAudio,
  IconFileImage,
  IconFileVideo,
  IconLock,
} from '@/components/ui/icons';

const FORMAT_ICONS: Record<Format, typeof IconFileImage> = {
  photo: IconFileImage,
  video: IconFileVideo,
  audio: IconFileAudio,
  documents: IconClipboardList,
  prasadi: IconBox,
};

/** `lots: null` from the API means the caller's role lacks `format:*` — locked. */
function isFormat(value: string): value is Format {
  return value in FORMAT_LABELS;
}

export function FormatBlocks() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard.blocks(),
    queryFn: dashboardApi.blocks,
  });

  if (error) {
    const e = error as ApiRequestError;
    return (
      <Panel>
        <ErrorState message={e.message} hint={e.hint} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Panel key={i} className="px-4 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-[8px]" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-9 w-full mt-4" />
          </Panel>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {data.blocks.map((block) => {
        const locked = block.lots === null;
        const format = isFormat(block.format) ? block.format : null;
        const label = format ? FORMAT_LABELS[block.format as Format] : block.format;
        const Icon = (format ? FORMAT_ICONS[format] : IconBox) ?? IconBox;

        const body = (
          <>
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-[8px] bg-surface-subtle border border-line-soft text-ink-2 flex items-center justify-center flex-shrink-0">
                <Icon size={18} />
              </span>
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[14px] font-semibold text-ink">{label}</span>
                <span className="text-[11.5px] text-ink-3">
                  {locked ? 'No access' : 'Open dashboard'}
                </span>
              </span>
              {locked && (
                <span className="ml-auto text-ink-4" aria-hidden="true">
                  <IconLock size={15} />
                </span>
              )}
            </span>

            {!locked && (
              <dl className="m-0 mt-3.5 pt-3 border-t border-line-soft grid grid-cols-3 gap-2">
                {(
                  [
                    ['Lots', block.lots],
                    ['In flight', block.inFlight],
                    ['Awaiting decision', block.awaitingDecision],
                  ] as const
                ).map(([statLabel, value]) => (
                  <div key={statLabel} className="flex flex-col gap-0.5 min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                      {statLabel}
                    </dt>
                    <dd className="m-0 text-[17px] font-semibold leading-none text-ink tabular-nums">
                      {num(value ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        );

        if (locked || !format) {
          return (
            <div
              key={block.format}
              aria-disabled="true"
              className="bg-surface border border-line rounded-[8px] shadow-control px-4 py-4 opacity-75 cursor-not-allowed"
            >
              {body}
            </div>
          );
        }

        return (
          <Link
            key={block.format}
            href={`/dashboard/${format}`}
            className="bg-surface border border-line rounded-[8px] shadow-control px-4 py-4 flex flex-col no-underline hover:border-line-strong transition-colors"
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}
