'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, prasadiChecksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { date } from '@/lib/format';
import { CHECK_RESULTS, MAX_RECHECK_WEEKS, type CheckResult } from '@/lib/recheck';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Field, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Dialog } from '@/components/ui/Dialog';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import type { PrasadiCheckList } from '@/types/items';

type Row = PrasadiCheckList['rows'][number];

/**
 * Prasadi items whose "re-check in N weeks" date has come — the queue behind the Alerts page's
 * "Prasadi check due". Grouped by lot; tick items (or a whole lot) and record the result: Good /
 * Needs care, an optional note, and when to look again (weeks; empty = no further reminder).
 */
export function PrasadiChecksPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState(false);
  const canAct = Boolean(me.data?.grants.includes('lot:edit'));

  const list = useQuery({
    queryKey: queryKeys.queues.prasadiChecks(page, pageSize),
    queryFn: () => prasadiChecksApi.due(page, pageSize),
    enabled: !!me.data,
  });
  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const lots = useMemo(() => {
    const map = new Map<string, { lotId: string; lotReference: string; rows: Row[] }>();
    for (const r of rows) {
      const g = map.get(r.lotId) ?? { lotId: r.lotId, lotReference: r.lotReference, rows: [] };
      g.rows.push(r);
      map.set(r.lotId, g);
    }
    return [...map.values()];
  }, [rows]);

  const done = useMutation({
    mutationFn: prasadiChecksApi.markChecked,
    onSuccess: (res) => {
      setPicked([]);
      setDialog(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(`${res.updated} ${res.updated === 1 ? 'item' : 'items'} checked`);
    },
    onError: (e) => toast.error('Could not save the check', e instanceof ApiRequestError ? e.message : undefined),
  });

  const toggleLot = (ids: string[], on: boolean) =>
    setPicked((p) => (on ? [...new Set([...p, ...ids])] : p.filter((x) => !ids.includes(x))));

  return (
    <Panel>
      <PanelHeader title="Prasadi checks due">
        {canAct ? (
          <PrimaryButton className="ml-auto" disabled={picked.length === 0} onClick={() => setDialog(true)}>
            {picked.length ? `Mark ${picked.length} checked` : 'Mark checked'}
          </PrimaryButton>
        ) : null}
      </PanelHeader>
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <p className="m-0 text-[12px] text-ink-3">
          Prasadi items whose “Re-check in” weeks have passed. Look at each one, then record how it is. Set the weeks in the lot’s Excel.
        </p>
        {list.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : list.isError ? (
          <ErrorState message="Couldn't load the checks." onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <p className="m-0 text-[12.5px] text-ink-3">Nothing is due. Every Prasadi item is within its check period.</p>
        ) : (
          lots.map((g) => {
            const ids = g.rows.map((r) => r.id);
            const all = ids.every((id) => picked.includes(id));
            return (
              <section key={g.lotId} aria-label={`Lot ${g.lotReference}`} className="rounded-[8px] border border-line overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-sunken">
                  {canAct ? (
                    <input
                      type="checkbox"
                      aria-label={`Select every item of ${g.lotReference}`}
                      className="h-4 w-4 accent-accent"
                      checked={all}
                      onChange={(e) => toggleLot(ids, e.target.checked)}
                    />
                  ) : null}
                  <Link href={`/register/${g.lotId}?tab=items`} className="text-[13px] font-semibold text-accent no-underline hover:underline">
                    {g.lotReference || 'Lot'}
                  </Link>
                  <span className="text-[12px] text-ink-3">
                    {g.rows.length} {g.rows.length === 1 ? 'item' : 'items'} to check
                  </span>
                </div>
                <ul className="m-0 p-0 list-none">
                  {g.rows.map((r) => (
                    <li
                      key={r.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_180px_170px] gap-x-3 gap-y-0.5 items-center px-3 py-2 border-t border-line-soft"
                    >
                      {canAct ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.code}`}
                          className="h-4 w-4 accent-accent"
                          checked={picked.includes(r.id)}
                          onChange={(e) => toggleLot([r.id], e.target.checked)}
                        />
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block font-mono text-[12.5px] font-semibold text-ink truncate">{r.code}</span>
                        <span className="block text-[12px] text-ink-2 truncate">
                          {[r.itemName, r.blessedBy].filter(Boolean).join(' · ') || 'No name recorded'}
                        </span>
                      </span>
                      <span className="col-start-2 sm:col-start-auto text-[12px] text-ink-3 truncate">
                        {r.condition ? `Condition: ${r.condition}` : 'Condition not recorded'}
                      </span>
                      <span className={`col-start-2 sm:col-start-auto text-[12px] ${r.daysOverdue > 0 ? 'text-warn' : 'text-ink-3'}`}>
                        Due {date(r.dueAt)}
                        {r.daysOverdue > 0 ? ` · ${r.daysOverdue} ${r.daysOverdue === 1 ? 'day' : 'days'} late` : ' · today'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
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
      {dialog ? (
        <CheckDialog
          count={picked.length}
          pending={done.isPending}
          onClose={() => setDialog(false)}
          onSave={(v) => done.mutate({ itemIds: picked, ...v })}
        />
      ) : null}
    </Panel>
  );
}

function CheckDialog({
  count,
  pending,
  onClose,
  onSave,
}: {
  count: number;
  pending: boolean;
  onClose: () => void;
  onSave: (v: { result: CheckResult; note?: string; nextWeeks: number | null }) => void;
}) {
  const [result, setResult] = useState<CheckResult>('good');
  const [note, setNote] = useState('');
  const [weeks, setWeeks] = useState('');
  const n = weeks.trim() === '' ? null : Number(weeks);
  const bad = n !== null && (!Number.isInteger(n) || n < 1 || n > MAX_RECHECK_WEEKS);

  return (
    <Dialog title={`Record check — ${count} ${count === 1 ? 'item' : 'items'}`} subtitle="How is the Prasadi, and when should it be looked at again?" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (bad) return;
          onSave({ result, note: note.trim() || undefined, nextWeeks: n });
        }}
      >
        <Field label="Result">
          <Select value={result} onChange={(e) => setResult(e.target.value as CheckResult)}>
            {CHECK_RESULTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note (optional)">
          <TextInput value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cloth slightly faded, moved to a dry shelf" />
        </Field>
        <Field label="Check again in" error={bad ? `Use a whole number of weeks (1–${MAX_RECHECK_WEEKS}).` : undefined} hint="Leave empty to stop reminders for these items.">
          <span className="flex items-center gap-2">
            <TextInput type="number" min={1} max={MAX_RECHECK_WEEKS} value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="e.g. 4" />
            <span className="text-[13px] text-ink-2">weeks</span>
          </span>
        </Field>
        <div className="flex justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending || bad}>
            {pending ? 'Saving…' : 'Save check'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
