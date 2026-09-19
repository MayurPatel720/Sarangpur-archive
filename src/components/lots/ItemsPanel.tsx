'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { DataTable } from '@/components/ui/DataTable';
import { Field, Select } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';

const PAGE_SIZE = 25;

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
  const [page, setPage] = useState(1);
  const [digitized, setDigitized] = useState('');
  const [tagged, setTagged] = useState('');
  const [dup, setDup] = useState('');

  const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
  if (digitized) params.digitized = digitized;
  if (tagged) params.taggedInMls = tagged;
  if (dup) params.mlsDuplicate = dup;
  const keyParams = JSON.stringify(params);

  const items = useQuery({
    queryKey: queryKeys.lots.items(lotId, keyParams),
    queryFn: () => lotsApi.items(lotId, params),
  });

  return (
    <Panel>
      <PanelHeader title="Items" />
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 max-w-[480px]">
          <TriFilter label="Digitized" value={digitized} onChange={(v) => { setDigitized(v); setPage(1); }} />
          <TriFilter label="Tagged" value={tagged} onChange={(v) => { setTagged(v); setPage(1); }} />
          <TriFilter label="Duplicate" value={dup} onChange={(v) => { setDup(v); setPage(1); }} />
        </div>

        {items.isError ? (
          <ErrorState message="Could not load items." onRetry={() => items.refetch()} />
        ) : (
          <>
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
            {items.data && items.data.total > PAGE_SIZE ? (
              <div className="flex items-center gap-3 text-[13px] text-ink-2">
                <button
                  type="button"
                  className="underline disabled:no-underline disabled:text-ink-4"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {items.data.page} of {Math.max(1, Math.ceil(items.data.total / items.data.pageSize))}
                </span>
                <button
                  type="button"
                  className="underline disabled:no-underline disabled:text-ink-4"
                  disabled={page >= Math.ceil(items.data.total / items.data.pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
