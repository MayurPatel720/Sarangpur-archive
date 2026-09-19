'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotListResponse } from '@/types/lot';
import { STAGE_LABELS, STAGES } from '@/lib/domain';
import type { Severity } from '@/types/dashboard';
import { Badge, ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { GhostButton } from '@/components/ui/Form';
import { useMe } from '@/hooks/useCan';
import { EMPTY_FILTERS, RegisterFilters, type LotFilters } from './RegisterFilters';

type LotRow = LotListResponse['rows'][number];

const STAGE_SEVERITY: Record<string, Severity> = {
  intake: 'info',
  decision: 'warning',
  metadata: 'info',
  scanning: 'info',
  mls_tag: 'info',
  storage: 'good',
  returned: 'neutral',
  discarded: 'critical',
};

const DECISION_SEVERITY: Record<string, Severity> = {
  pending: 'warning',
  archive: 'good',
  return: 'info',
  discard: 'critical',
};

const COLUMNS: Column<LotRow>[] = [
  {
    key: 'ref',
    header: 'Lot',
    render: (r) => (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-ink whitespace-nowrap">{r.lotReference}</span>
        {r.namingCode ? (
          <span className="text-[11.5px] text-ink-3 whitespace-nowrap">{r.namingCode}</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'received',
    header: 'Received',
    render: (r) => <span className="whitespace-nowrap">{r.dateReceived.slice(0, 10)}</span>,
  },
  {
    key: 'owner',
    header: 'Owner',
    render: (r) => (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="truncate">{r.ownerName}</span>
        {r.pointOfContactName ? (
          <span className="text-[11.5px] text-ink-3 truncate">via {r.pointOfContactName}</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'media',
    header: 'Media',
    render: (r) => (
      <span className="whitespace-nowrap capitalize">
        {r.format} · {r.quantity}
      </span>
    ),
  },
  {
    key: 'stage',
    header: 'Stage',
    render: (r) => (
      <Badge severity={STAGE_SEVERITY[r.stage] ?? 'neutral'}>
        {STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] ?? r.stage}
      </Badge>
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
    key: 'receiver',
    header: 'Receiver',
    render: (r) => <span className="whitespace-nowrap">{r.receiverName}</span>,
  },
];

function toParams(filters: LotFilters, page: number): Record<string, string> {
  const p: Record<string, string> = { page: String(page), sort: filters.sort };
  if (filters.q.trim()) p.q = filters.q.trim();
  if (filters.stage) p.stage = filters.stage;
  if (filters.decision) p.decision = filters.decision;
  if (filters.format) p.format = filters.format;
  if (filters.dataType) p.dataType = filters.dataType;
  if (filters.receivedFrom) p.receivedFrom = new Date(`${filters.receivedFrom}T00:00:00`).toISOString();
  if (filters.receivedTo) p.receivedTo = new Date(`${filters.receivedTo}T23:59:59`).toISOString();
  return p;
}

export function RegisterManager({ initialStage }: { initialStage?: string }) {
  const router = useRouter();
  const cleanStage =
    initialStage && (STAGES as readonly string[]).includes(initialStage) ? initialStage : '';
  const [filters, setFilters] = useState<LotFilters>({ ...EMPTY_FILTERS, stage: cleanStage });
  const [page, setPage] = useState(1);
  const me = useMe();
  const can = me.data ? me.data.grants.includes('lot:view') : false;

  const params = useMemo(() => toParams(filters, page), [filters, page]);
  const key = useMemo(() => JSON.stringify(params), [params]);
  const query = useQuery({
    queryKey: queryKeys.lots.list(key),
    queryFn: () => lotsApi.list(params),
    enabled: !!me.data && can,
  });

  const applyFilters = (next: LotFilters) => {
    setFilters(next);
    setPage(1);
  };

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Lots" />
        <div className="p-3 md:p-4">
          <DataTable<LotRow>
            columns={COLUMNS}
            rows={[]}
            loading
            emptyMessage=""
            getRowKey={(r) => r.id}
          />
        </div>
      </Panel>
    );
  }

  if (!can) {
    return (
      <Panel>
        <ErrorState
          message="You don't have access to the lot register."
          hint="Ask an admin for the lot:view permission."
        />
      </Panel>
    );
  }

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
            Lot register
          </h1>
          <p className="m-0 text-[12.5px] text-ink-3">
            {query.data ? `${query.data.total} lots on record.` : 'Every lot from intake onward.'}
          </p>
        </div>
        <div className="sm:ml-auto">
          <Link
            href="/register/new"
            className="inline-flex items-center justify-center h-10 px-4 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[13px] font-semibold no-underline"
          >
            New intake
          </Link>
        </div>
      </div>

      <RegisterFilters filters={filters} onChange={applyFilters} />

      <Panel>
        <PanelHeader title="Lots" />
        <div className="p-3 md:p-4">
          {query.isError ? (
            <ErrorState
              message="Couldn't load the register."
              hint="Check your connection and try again."
              onRetry={() => query.refetch()}
            />
          ) : (
            <>
              <DataTable<LotRow>
                columns={COLUMNS}
                rows={query.data?.rows ?? []}
                loading={query.isLoading}
                emptyMessage="No lots match these filters."
                getRowKey={(r) => r.id}
                onRowClick={(r) => router.push(`/register/${r.id}`)}
              />
              {query.data && query.data.total > 0 ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[12.5px] text-ink-3">
                    Page {query.data.page} of {totalPages} · {query.data.total} total
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <GhostButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </GhostButton>
                    <GhostButton
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </GhostButton>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
