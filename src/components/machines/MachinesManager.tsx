'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, machinesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { todayIso } from '@/lib/format';
import { useCan, useMe } from '@/hooks/useCan';
import { useUrlPagination } from '@/lib/useUrlPagination';
import { IconPlus } from '@/components/ui/icons';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { TextInput } from '@/components/ui/Form';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { ConditionBadge, LoanChip, ServiceChip, UsageChip } from '@/components/machines/MachineBadges';
import { MachineDialog } from '@/components/machines/MachineDialog';
import type { MachineCreateBody, MachineListResponse } from '@/types/machine';

const VIEWS = [
  { id: 'all', label: 'All', count: 'all' },
  { id: 'working', label: 'Working', count: 'working' },
  { id: 'needs_repair', label: 'Needs repair', count: 'needsRepair' },
  { id: 'not_working', label: 'Not working', count: 'notWorking' },
  { id: 'loan', label: 'Lent out', count: 'onLoan' },
  { id: 'service', label: 'Service due', count: 'serviceDue' },
] as const satisfies readonly { id: string; label: string; count: keyof MachineListResponse['counts'] }[];
type ViewId = (typeof VIEWS)[number]['id'];

/** The Machines page: counters you can click to filter, a search box, and the register. */
export function MachinesManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canManage = useCan('machine:manage');
  const canView = me.data?.grants?.includes('machine:view') ?? false;
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(25);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const viewRaw = searchParams.get('view');
  const view: ViewId = VIEWS.some((v) => v.id === viewRaw) ? (viewRaw as ViewId) : 'all';
  const q = searchParams.get('q') ?? '';

  const patchUrl = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Free text is debounced into the URL so each keystroke is not a request.
  const [text, setText] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (text.trim() !== q) {
        patchUrl((p) => {
          if (text.trim()) p.set('q', text.trim());
          else p.delete('q');
          p.delete('page');
        });
      }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize), today: todayIso() };
  if (q) params.q = q;
  if (view === 'working' || view === 'needs_repair' || view === 'not_working') params.condition = view;
  if (view === 'loan') params.loan = 'out';
  if (view === 'service') params.service = 'due';

  const list = useQuery({
    queryKey: queryKeys.machines.list(JSON.stringify(params)),
    queryFn: () => machinesApi.list(params),
    enabled: canView,
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: (b: MachineCreateBody) => machinesApi.create(b),
    onSuccess: (res) => {
      setAdding(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.machines.all });
      toast.success(`${res.machine.code} added`);
      router.push(`/machines/${res.machine.id}`);
    },
    onError: (e) => setAddError(e instanceof ApiRequestError ? e.message : 'Could not add the machine.'),
  });

  if (me.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!canView) {
    return (
      <Panel>
        <ErrorState message="You don't have access to machines." hint="Ask an admin for the machine:view permission." />
      </Panel>
    );
  }

  const data = list.data;
  const totalPages = data ? totalPagesOf(data.total, data.pageSize) : 1;
  const today = todayIso();

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-balance text-[20px] font-semibold tracking-[-0.022em] text-ink sm:text-[24px]">Machines</h1>
          <p className="m-0 text-[12.5px] tabular-nums text-ink-3" aria-live="polite">
            {data ? `${data.counts.all} ${data.counts.all === 1 ? 'machine' : 'machines'} in the register.` : 'Recorders, cameras, scanners and everything else we run.'}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setAdding(true);
            }}
            className="inline-flex h-10 cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-[6px] border border-accent bg-accent px-4 text-[13px] font-semibold text-white shadow-accent transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:ml-auto"
          >
            <IconPlus size={14} />
            Add machine
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3 shadow-control md:p-4">
        <div role="group" aria-label="Show machines" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => {
            const active = v.id === view;
            const n = data?.counts[v.count];
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  patchUrl((p) => {
                    if (v.id === 'all') p.delete('view');
                    else p.set('view', v.id);
                    p.delete('page');
                  })
                }
                className={`inline-flex h-9 cursor-pointer touch-manipulation items-center gap-2 rounded-[6px] border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong bg-surface text-ink-2 hover:text-ink'
                }`}
              >
                {v.label}
                {n !== undefined ? <span className="tabular-nums text-ink-3">{n}</span> : null}
              </button>
            );
          })}
        </div>
        <div role="search" aria-label="Search machines" className="max-w-[420px]">
          <TextInput
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            name="q"
            autoComplete="off"
            spellCheck={false}
            placeholder="Name, code, make, model, serial, location…"
            aria-label="Search machines"
          />
        </div>
      </div>

      <Panel className="overflow-hidden">
        {list.isError ? (
          <ErrorState
            message={list.error instanceof ApiRequestError ? list.error.message : 'Could not load machines.'}
            onRetry={() => void list.refetch()}
          />
        ) : !data ? (
          <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading machines">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[56px] w-full" />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <p className="m-0 text-balance px-4 py-12 text-center text-[13px] font-medium text-ink-3">
            {q || view !== 'all' ? 'No machines match these filters.' : canManage ? 'No machines yet. Add the first one.' : 'No machines yet.'}
          </p>
        ) : (
          data.rows.map((m) => (
            <Link
              key={m.id}
              href={`/machines/${m.id}`}
              className="flex min-w-0 flex-col gap-1.5 border-b border-line-row px-4 py-3 text-ink no-underline transition-colors last:border-b-0 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="break-words text-[15px] font-semibold leading-snug">{m.name}</span>
                  <span className="truncate text-[12px] text-ink-3">
                    <span className="tabular-nums">{m.code}</span>
                    {[m.make, m.model].filter(Boolean).length ? ` · ${[m.make, m.model].filter(Boolean).join(' ')}` : ''}
                    {m.serialNo ? ` · S/N ${m.serialNo}` : ''}
                    {m.location ? ` · ${m.location}` : ''}
                  </span>
                </div>
                <ConditionBadge condition={m.condition} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {m.category ? (
                  <span className="inline-flex items-center rounded-[4px] border border-line bg-surface-sunken px-1.5 py-[2px] text-[11px] font-medium text-ink-2">{m.category}</span>
                ) : null}
                <UsageChip inUse={m.inUse} />
                {m.loanedTo ? <LoanChip to={m.loanedTo} /> : null}
                {m.openRepairs > 0 ? (
                  <span className="inline-flex items-center rounded-[4px] border border-warn-line bg-warn-bg px-1.5 py-[2px] text-[11px] font-semibold text-warn">
                    {m.openRepairs} open {m.openRepairs === 1 ? 'repair' : 'repairs'}
                  </span>
                ) : null}
                <ServiceChip due={m.nextServiceDue} today={today} />
              </div>
            </Link>
          ))
        )}
        {data ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="machines"
          />
        ) : null}
      </Panel>

      {adding ? (
        <MachineDialog
          pending={create.isPending}
          error={addError}
          onSave={(body) => create.mutate(body)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
