'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { LotListResponse } from '@/types/lot';
import type { Permission } from '@/server/permissions';
import { STAGE_LABELS } from '@/lib/domain';
import { date } from '@/lib/format';
import type { Severity } from '@/types/dashboard';
import { Badge, ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useUrlPagination } from '@/lib/useUrlPagination';
import { useMe } from '@/hooks/useCan';
import { LotRowActions } from './LotRowActions';

type Row = LotListResponse['rows'][number];

const DECISION_SEVERITY: Record<string, Severity> = {
  pending: 'warning',
  archive: 'good',
  return: 'info',
  discard: 'critical',
};

export function QueueTable({
  title,
  subtitle,
  gate,
  deniedMessage,
  deniedHint,
  emptyMessage,
  queryKey,
  fetchPage,
  showReturn = false,
  showDecision = false,
  defaultPageSize = 25,
}: {
  title: string;
  subtitle: (total: number | null) => string;
  gate: Permission;
  deniedMessage: string;
  deniedHint: string;
  emptyMessage: string;
  queryKey: (page: number, pageSize: number) => readonly unknown[];
  fetchPage: (page: number, pageSize: number) => Promise<LotListResponse>;
  showReturn?: boolean;
  showDecision?: boolean;
  defaultPageSize?: number;
}) {
  return (
    <Suspense fallback={null}>
      <QueueTableInner
        title={title}
        subtitle={subtitle}
        gate={gate}
        deniedMessage={deniedMessage}
        deniedHint={deniedHint}
        emptyMessage={emptyMessage}
        queryKey={queryKey}
        fetchPage={fetchPage}
        showReturn={showReturn}
        showDecision={showDecision}
        defaultPageSize={defaultPageSize}
      />
    </Suspense>
  );
}

function QueueTableInner({
  title,
  subtitle,
  gate,
  deniedMessage,
  deniedHint,
  emptyMessage,
  queryKey,
  fetchPage,
  showReturn,
  showDecision,
  defaultPageSize,
}: {
  title: string;
  subtitle: (total: number | null) => string;
  gate: Permission;
  deniedMessage: string;
  deniedHint: string;
  emptyMessage: string;
  queryKey: (page: number, pageSize: number) => readonly unknown[];
  fetchPage: (page: number, pageSize: number) => Promise<LotListResponse>;
  showReturn?: boolean;
  showDecision?: boolean;
  defaultPageSize?: number;
}) {
  const router = useRouter();
  const me = useMe();
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(defaultPageSize);

  const queue = useQuery({
    queryKey: queryKey(page, pageSize),
    queryFn: () => fetchPage(page, pageSize),
    enabled: me.data ? me.data.grants.includes(gate) : false,
  });

  if (me.isLoading) {
    return (
      <Panel>
        <div className="p-3 md:p-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Panel>
    );
  }

  if (!me.data || !me.data.grants.includes(gate)) {
    return (
      <Panel>
        <ErrorState message={deniedMessage} hint={deniedHint} />
      </Panel>
    );
  }

  const totalPages = queue.data ? totalPagesOf(queue.data.total, queue.data.pageSize) : 1;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
          {title}
        </h1>
        <p className="m-0 text-[12.5px] text-ink-3">
          {subtitle(queue.data ? queue.data.total : null)}
        </p>
      </div>

      {queue.isError ? (
        <Panel>
          <ErrorState
            message={`Couldn't load the ${title.toLowerCase()}.`}
            hint="Check your connection and try again."
            onRetry={() => queue.refetch()}
          />
        </Panel>
      ) : (
        <Panel>
          <div className="p-3 md:p-4 pb-0">
            <DataTable<Row>
              rows={queue.data ? queue.data.rows : []}
              loading={queue.isLoading}
              emptyMessage={emptyMessage}
              getRowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/register/${r.id}`)}
              rowActions={(r) => <LotRowActions row={r} />}
              columns={[
                {
                  key: 'lot',
                  header: 'Lot',
                  render: (r) => (
                    <span className="flex flex-col">
                      <span className="font-semibold text-ink">{r.lotReference}</span>
                      {r.namingCode ? <span className="text-ink-3">{r.namingCode}</span> : null}
                    </span>
                  ),
                },
                {
                  key: 'owner',
                  header: 'Owner',
                  render: (r) => (
                    <span className="flex flex-col">
                      <span className="text-ink">{r.ownerName}</span>
                      <span className="text-ink-3">{r.pointOfContactName ?? '—'}</span>
                    </span>
                  ),
                },
                {
                  key: 'media',
                  header: 'Media',
                  render: (r) => (
                    <span className="text-ink">
                      <span className="capitalize">{r.format}</span> · {r.quantity}
                    </span>
                  ),
                },
                ...(showDecision
                  ? [
                      {
                        key: 'decision',
                        header: 'Decision',
                        render: (r: Row) => (
                          <Badge severity={DECISION_SEVERITY[r.decision] ?? 'neutral'}>
                            <span className="capitalize">{r.decision}</span>
                          </Badge>
                        ),
                      },
                    ]
                  : []),
                ...(showReturn
                  ? [
                      {
                        key: 'return',
                        header: 'Return',
                        render: (r: Row) => (
                          <Badge severity={r.returnSeverity}>
                            <span className="capitalize">{r.returnLabel}</span>
                          </Badge>
                        ),
                      },
                    ]
                  : []),
                {
                  key: 'stage',
                  header: 'Stage',
                  render: (r) => (
                    <span className="text-ink-2">
                      {STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] ?? r.stage}
                    </span>
                  ),
                },
                {
                  key: 'received',
                  header: 'Received',
                  render: (r) => <span className="text-ink-2">{date(r.dateReceived)}</span>,
                },
              ]}
            />
          </div>
          {queue.data && queue.data.total > 0 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={queue.data.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              label="lots"
            />
          ) : null}
        </Panel>
      )}
    </div>
  );
}
