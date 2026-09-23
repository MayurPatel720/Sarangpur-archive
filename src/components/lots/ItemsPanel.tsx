'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { DataTable } from '@/components/ui/DataTable';
import { Field, Select } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useUrlPagination } from '@/lib/useUrlPagination';

function TriFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    </Field>
  );
}

const tick = (v: boolean) => (v ? <span className="text-accent font-semibold">Yes</span> : <span className="text-ink-4">No</span>);

export function ItemsPanel({ lotId }: { lotId: string }) {
  return (
    <Suspense fallback={null}>
      <ItemsPanelInner lotId={lotId} />
    </Suspense>
  );
}

function ItemsPanelInner({ lotId }: { lotId: string }) {
  const { page, pageSize, setPage, setPageSize, resetPage } = useUrlPagination(25);
  const [digitized, setDigitized] = useState('');
  const [tagged, setTagged] = useState('');
  const [dup, setDup] = useState('');

  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
  if (digitized) params.digitized = digitized;
  if (tagged) params.taggedInMls = tagged;
  if (dup) params.mlsDuplicate = dup;
  const keyParams = JSON.stringify(params);

  const items = useQuery({
    queryKey: queryKeys.lots.items(lotId, keyParams),
    queryFn: () => lotsApi.items(lotId, params),
  });

  const totalPages = items.data ? totalPagesOf(items.data.total, items.data.pageSize) : 1;

  return (
    <Panel>
      <PanelHeader title="Items" />
      <div className="p-3 md:p-4 pb-0 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 max-w-[480px]">
          <TriFilter
            label="Digitized"
            value={digitized}
            onChange={(v) => {
              setDigitized(v);
              resetPage();
            }}
          />
          <TriFilter
            label="Tagged"
            value={tagged}
            onChange={(v) => {
              setTagged(v);
              resetPage();
            }}
          />
          <TriFilter
            label="Duplicate"
            value={dup}
            onChange={(v) => {
              setDup(v);
              resetPage();
            }}
          />
        </div>

        {items.isError ? (
          <ErrorState message="Could not load items." onRetry={() => items.refetch()} />
        ) : (
          <DataTable
            columns={[
              { key: 'code', header: 'Code', render: (r: { code: string }) => <span className="font-mono">{r.code}</span> },
              { key: 'group', header: 'Group', render: (r: { groupNo: number }) => String(r.groupNo) },
              { key: 'item', header: 'Item', render: (r: { itemNo: number }) => String(r.itemNo) },
              { key: 'selected', header: 'Selected', render: (r: { selectedForDigitization: boolean }) => tick(r.selectedForDigitization) },
              { key: 'digitized', header: 'Digitized', render: (r: { digitized: boolean }) => tick(r.digitized) },
              { key: 'tagged', header: 'Tagged', render: (r: { taggedInMls: boolean }) => tick(r.taggedInMls) },
              { key: 'dup', header: 'Duplicate', render: (r: { mlsDuplicate: boolean }) => tick(r.mlsDuplicate) },
            ]}
            rows={items.data?.rows ?? []}
            loading={items.isLoading}
            emptyMessage="No items match these filters."
            getRowKey={(r: { id: string }) => r.id}
          />
        )}
      </div>
      {items.data && items.data.total > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={items.data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          label="items"
        />
      ) : null}
    </Panel>
  );
}
