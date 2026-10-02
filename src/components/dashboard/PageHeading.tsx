'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { dashboardApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan } from '@/hooks/useCan';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { scopedHref } from '@/lib/dashboard-links';
import { longDate, num } from '@/lib/format';
import { Skeleton } from '@/components/ui/primitives';
import { IconChevronLeft, IconPlus } from '@/components/ui/icons';

export function PageHeading({ format }: { format?: Format } = {}) {
  const { data } = useQuery({
    queryKey: queryKeys.dashboard.summary(format),
    queryFn: () => dashboardApi.summary(format),
  });
  const canCreate = useCan('lot:create');

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
      <div className="flex flex-col gap-1.5 min-w-0">
        {format && (
          <Link
            href="/dashboard"
            className="w-fit text-[12px] font-semibold text-ink-4 no-underline hover:text-ink flex items-center gap-1"
          >
            <IconChevronLeft size={13} />
            All formats
          </Link>
        )}
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
          {format ? `${FORMAT_LABELS[format]} dashboard` : 'Archive operations'}
        </h1>
        {!data ? (
          <Skeleton className="h-3 w-96 max-w-full" />
        ) : (
          <p className="m-0 text-[12.5px] text-ink-3">
            {longDate(data.generatedAt)} · {num(data.activeLotCount)} lots in the pipeline ·{' '}
            {data.storage.usedTb} TB of masters under management
          </p>
        )}
      </div>

      <div className="flex gap-2.5 sm:ml-auto">
        {canCreate && (
          <Link
            href={scopedHref('/register/new', format)}
            className="h-10 px-3.5 bg-accent rounded-[6px] shadow-control text-[13px] font-semibold text-white no-underline flex items-center gap-1.5"
          >
            <IconPlus size={15} />
            New Intake
          </Link>
        )}
        <select
          aria-label="Reporting period"
          defaultValue="30"
          disabled
          title="The window is fixed at 30 days in this slice"
          className="h-10 pl-3 pr-8 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] font-medium text-ink-2 appearance-none disabled:opacity-70"
        >
          <option value="30">Last 30 days</option>
        </select>
        <button
          type="button"
          disabled
          title="Reporting exports arrive with the analytics slice"
          className="h-10 px-3.5 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] font-semibold text-ink-2 disabled:opacity-70"
        >
          Export report
        </button>
      </div>
    </div>
  );
}
