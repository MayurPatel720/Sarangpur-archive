'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useReferenceList } from '@/hooks/useReferenceList';
import { date } from '@/lib/format';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { PrimaryButton } from '@/components/ui/Form';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';

/**
 * Single items to hand back or discard, from lots that were otherwise archived
 * ("split by item"). Whole-lot returns/discards stay in the lot queue above.
 */
export function ItemDispositionsPanel({ kind }: { kind: 'return' | 'discard' }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const reasons = useReferenceList('notDigitizedReason');
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [picked, setPicked] = useState<string[]>([]);
  const canAct = Boolean(me.data?.grants.includes(kind === 'return' ? 'return:manage' : 'discard:confirm'));
  const verb = kind === 'return' ? 'returned' : 'discarded';

  const list = useQuery({
    queryKey: queryKeys.queues.itemDispositions(kind, status, page, pageSize),
    queryFn: () => itemsGridApi.dispositions(kind, status, page, pageSize),
    enabled: !!me.data,
  });

  const done = useMutation({
    mutationFn: (ids: string[]) => itemsGridApi.markDone({ kind, itemIds: ids }),
    onSuccess: (res) => {
      setPicked([]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      toast.success(`${res.updated} ${res.updated === 1 ? 'item' : 'items'} marked ${verb}`);
    },
    onError: (e) => toast.error('Could not update', e instanceof ApiRequestError ? e.message : undefined),
  });

  const rows = list.data?.rows ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));
  const reasonLabel = (v: string | null) => (v ? (reasons.data?.items.find((i) => i.value === v)?.label ?? v) : '—');

  return (
    <Panel>
      <PanelHeader title={kind === 'return' ? 'Single items to return' : 'Single items to discard'}>
        <span className="ml-auto flex gap-1.5" role="group" aria-label="Show">
          {(['pending', 'done'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
                setPicked([]);
              }}
              className={`min-h-[30px] px-2.5 rounded-[6px] border text-[12px] font-semibold cursor-pointer ${
                status === s ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink-2'
              }`}
            >
              {s === 'pending' ? 'To do' : verb.charAt(0).toUpperCase() + verb.slice(1)}
            </button>
          ))}
        </span>
      </PanelHeader>
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <p className="m-0 text-[12px] text-ink-3">
          Items decided “{kind}” inside lots that were otherwise archived. Whole lots to {kind} are listed above.
        </p>
        {list.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : list.isError ? (
          <ErrorState message="Couldn't load the items." onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <p className="m-0 text-[12.5px] text-ink-3">{status === 'pending' ? 'Nothing waiting.' : `No items ${verb} yet.`}</p>
        ) : (
          <>
            {status === 'pending' && canAct ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2 min-h-[36px] cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={allPicked}
                    onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                  Select all on this page
                </label>
                <PrimaryButton
                  className="sm:ml-auto"
                  disabled={picked.length === 0 || done.isPending}
                  onClick={() => done.mutate(picked)}
                >
                  {done.isPending ? 'Saving…' : `Mark ${picked.length || ''} ${verb}`}
                </PrimaryButton>
              </div>
            ) : null}
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_200px_140px] gap-x-3 gap-y-0.5 items-center rounded-[6px] border border-line-soft px-3 py-2"
                >
                  {status === 'pending' && canAct ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.code}`}
                      className="h-4 w-4 accent-accent"
                      checked={picked.includes(r.id)}
                      onChange={(e) =>
                        setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))
                      }
                    />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-mono text-[12.5px] font-semibold text-ink truncate">{r.code}</span>
                    <span className="block text-[12px] text-ink-2 truncate">{r.name ?? 'Unnamed item'}</span>
                  </span>
                  <span className="col-start-2 sm:col-start-auto text-[12px] text-ink-3 truncate">
                    <Link href={`/register/${r.lotId}?tab=items`} className="text-accent no-underline hover:underline">
                      {r.lotReference || 'Lot'}
                    </Link>{' '}
                    · {reasonLabel(r.reason)}
                  </span>
                  <span className="col-start-2 sm:col-start-auto text-[12px] text-ink-3">
                    {status === 'pending' ? `Decided ${date(r.decidedAt)}` : `${date(r.doneAt)} · ${r.doneByName ?? ''}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {list.data && list.data.total > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPagesOf(list.data.total, list.data.pageSize)}
          total={list.data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          label="items"
        />
      ) : null}
    </Panel>
  );
}
