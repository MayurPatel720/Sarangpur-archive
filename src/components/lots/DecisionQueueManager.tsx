'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queuesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotListResponse } from '@/types/lot';
import { STAGE_LABELS } from '@/lib/domain';
import type { Severity } from '@/types/dashboard';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/DataTable';
import { GhostButton } from '@/components/ui/Form';
import { useMe } from '@/hooks/useCan';

type Row = LotListResponse['rows'][number];

const PAGE_SIZE = 20;

const DECISION_SEVERITY: Record<string, Severity> = {
  pending: 'warning',
  archive: 'good',
  return: 'info',
  discard: 'critical',
};

export function DecisionQueueManager() {
  const router = useRouter();
  const me = useMe();
  const [page, setPage] = useState(1);

  const queue = useQuery({
    queryKey: queryKeys.queues.decision(page, PAGE_SIZE),
    queryFn: () => queuesApi.decision(page, PAGE_SIZE),
    enabled: me.data ? me.data.grants.includes('decision:view') : false,
  });

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Decision queue" />
        <div className="p-3 md:p-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Panel>
    );
  }

  if (!me.data || !me.data.grants.includes('decision:view')) {
    return (
      <Panel>
        <ErrorState
          message="Decision queue is restricted."
          hint="You don't have permission to work the decision queue."
        />
      </Panel>
    );
  }

  const totalPages = queue.data ? Math.max(1, Math.ceil(queue.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
          Decision queue
        </h1>
        <p className="m-0 text-[12.5px] text-ink-3">
          Oldest waiting first
          {queue.data ? ` · ${queue.data.total} lot${queue.data.total === 1 ? '' : 's'} awaiting decision` : ''}
        </p>
      </div>

      {queue.isError ? (
        <Panel>
          <ErrorState
            message="Couldn't load the decision queue."
            hint="Check your connection and try again."
            onRetry={() => queue.refetch()}
          />
        </Panel>
      ) : (
        <Panel>
          <DataTable<Row>
            rows={queue.data ? queue.data.rows : []}
            loading={queue.isLoading}
            emptyMessage="The decision queue is empty — nothing is waiting."
            getRowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/register/${r.id}`)}
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
              {
                key: 'decision',
                header: 'Decision',
                render: (r) => (
                  <Badge severity={DECISION_SEVERITY[r.decision] ?? 'neutral'}>
                    <span className="capitalize">{r.decision}</span>
                  </Badge>
                ),
              },
              {
                key: 'stage',
                header: 'Stage',
                render: (r) => (
                  <span className="text-ink-2">{STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] ?? r.stage}</span>
                ),
              },
              {
                key: 'received',
                header: 'Received',
                render: (r) => <span className="text-ink-2">{r.dateReceived.slice(0, 10)}</span>,
              },
            ]}
          />
          {totalPages > 1 ? (
            <div className="flex items-center gap-2 px-3 md:px-4 py-3 border-t border-line-soft">
              <GhostButton disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </GhostButton>
              <span className="text-[13px] text-ink-3">
                Page {page} of {totalPages}
              </span>
              <GhostButton disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </GhostButton>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
