'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotListResponse } from '@/types/lot';
import { ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { useLotDnd, type LotSection } from '@/hooks/useLotDnd';
import { useStoredFlag } from '@/hooks/useStoredFlag';
import { LotRowActions } from './LotRowActions';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox } from '@/components/ui/Checkbox';
import { GhostButton, PrimaryButton } from '@/components/ui/Form';
import { IconChevronDown } from '@/components/ui/icons';

type LotRow = LotListResponse['rows'][number];

const NEW_PAGE_SIZE = 10;
const COLLAPSE_KEY = 'archive.myLots.newlyArrived.collapsed';
const NEW_BODY_ID = 'my-lots-new-body';

const keyFor = (params: Record<string, string>) => queryKeys.lots.list(JSON.stringify(params));

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

function CountBadge({ n }: { n: number | undefined }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full bg-accent-soft text-accent text-[11.5px] font-semibold">
      {n ?? '-'}
    </span>
  );
}

/**
 * My lots (`?assignee=me`): "Newly arrived" and "Lots" sections. Which section a
 * lot is in is a private per-person flag (LotPickup): drag a row across, or use
 * the "Move to Lots" button. `baseParams` carries the register filters (search,
 * sort, stage, ...) plus the assignee id, so they apply to both sections.
 */
export function MyLotsSections({
  baseParams,
  columns,
  onRowClick,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  baseParams: Record<string, string>;
  columns: Column<LotRow>[];
  onRowClick: (row: LotRow) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [announce, setAnnounce] = useState('');

  const filterKey = JSON.stringify(baseParams);
  const [newPage, setNewPage] = useState(1);
  useEffect(() => setNewPage(1), [filterKey]);

  const newParams = useMemo(
    () => ({ ...baseParams, arrival: 'new', page: String(newPage), pageSize: String(NEW_PAGE_SIZE) }),
    [baseParams, newPage],
  );
  const lotsParams = useMemo(
    () => ({ ...baseParams, arrival: 'accepted', page: String(page), pageSize: String(pageSize) }),
    [baseParams, page, pageSize],
  );
  const newQuery = useQuery({ queryKey: keyFor(newParams), queryFn: () => lotsApi.list(newParams) });
  const lotsQuery = useQuery({ queryKey: keyFor(lotsParams), queryFn: () => lotsApi.list(lotsParams) });

  // Keep each page inside range after a move empties its last page.
  const newPages = newQuery.data ? totalPagesOf(newQuery.data.total, newQuery.data.pageSize) : 1;
  const lotsPages = lotsQuery.data ? totalPagesOf(lotsQuery.data.total, lotsQuery.data.pageSize) : 1;
  useEffect(() => {
    if (newPage > newPages) setNewPage(newPages);
  }, [newPage, newPages]);
  useEffect(() => {
    if (page > lotsPages) onPageChange(lotsPages);
  }, [page, lotsPages, onPageChange]);

  const [storedCollapsed, setStoredCollapsed] = useStoredFlag(COLLAPSE_KEY);
  const newTotal = newQuery.data?.total;
  // Default: expanded when there is something new, collapsed when empty.
  const collapsed = storedCollapsed ?? (newTotal === undefined ? false : newTotal === 0);

  const move = useMutation({
    mutationFn: ({ row, to }: { row: LotRow; to: LotSection }) =>
      lotsApi.setPickup({ lotId: row.id, accepted: to === 'accepted' }),
    onMutate: async ({ row, to }) => {
      const fromKey = keyFor(to === 'accepted' ? newParams : lotsParams);
      const toKey = keyFor(to === 'accepted' ? lotsParams : newParams);
      await queryClient.cancelQueries({ queryKey: queryKeys.lots.all });
      const prevFrom = queryClient.getQueryData<LotListResponse>(fromKey);
      const prevTo = queryClient.getQueryData<LotListResponse>(toKey);
      if (prevFrom) {
        queryClient.setQueryData<LotListResponse>(fromKey, {
          ...prevFrom,
          rows: prevFrom.rows.filter((r) => r.id !== row.id),
          total: Math.max(0, prevFrom.total - 1),
        });
      }
      if (prevTo && !prevTo.rows.some((r) => r.id === row.id)) {
        queryClient.setQueryData<LotListResponse>(toKey, {
          ...prevTo,
          rows: [row, ...prevTo.rows].slice(0, prevTo.pageSize),
          total: prevTo.total + 1,
        });
      }
      return { fromKey, toKey, prevFrom, prevTo };
    },
    onSuccess: (_d, { row, to }) =>
      setAnnounce(`${row.lotReference} moved to ${to === 'accepted' ? 'Lots' : 'Newly arrived'}.`),
    onError: (e, { row }, ctx) => {
      if (ctx?.prevFrom) queryClient.setQueryData(ctx.fromKey, ctx.prevFrom);
      if (ctx?.prevTo) queryClient.setQueryData(ctx.toKey, ctx.prevTo);
      toast.error(
        `Couldn't move ${row.lotReference}`,
        e instanceof ApiRequestError ? e.message : undefined,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
    },
  });

  // Selection in "Newly arrived" + the confirm step before anything moves into Lots.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<LotRow[] | null>(null);
  const newRows = useMemo(() => newQuery.data?.rows ?? [], [newQuery.data]);
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(newRows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [newRows]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = newRows.length > 0 && newRows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(newRows.map((r) => r.id)));

  /** Dragging/clicking a selected row moves the whole selection; otherwise just that row. */
  const requestMove = useCallback(
    (row: LotRow) => {
      const picked = newRows.filter((r) => selected.has(r.id));
      setPending(selected.has(row.id) && picked.length > 1 ? picked : [row]);
    },
    [newRows, selected],
  );

  const confirmMove = useMutation({
    mutationFn: async (rows: LotRow[]) => {
      const results = await Promise.allSettled(
        rows.map((r) => lotsApi.setPickup({ lotId: r.id, accepted: true })),
      );
      const failed = rows.filter((_, i) => results[i]!.status === 'rejected');
      return { moved: rows.length - failed.length, failed };
    },
    onSuccess: ({ moved, failed }) => {
      if (moved > 0) setAnnounce(`${moved} ${moved === 1 ? 'lot' : 'lots'} moved to Lots.`);
      if (failed.length > 0) {
        toast.error(
          `Couldn't move ${failed.length} ${failed.length === 1 ? 'lot' : 'lots'}`,
          failed.map((r) => r.lotReference).join(', '),
        );
      }
      setSelected(new Set());
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
    },
    onError: (e) => {
      toast.error("Couldn't move lots", e instanceof ApiRequestError ? e.message : undefined);
      setPending(null);
    },
  });

  // Moving INTO Lots always asks first; moving back to Newly arrived is instant.
  const mutate = move.mutate;
  const onMove = useCallback(
    (row: LotRow, to: LotSection) => (to === 'accepted' ? requestMove(row) : mutate({ row, to })),
    [mutate, requestMove],
  );
  const dnd = useLotDnd<LotRow>(onMove);

  const selectColumn: Column<LotRow> = {
    key: 'select',
    header: '',
    className: 'w-10 !pr-0',
    render: (r) => (
      <span className="flex h-[22px] items-center">
        <Checkbox
          checked={selected.has(r.id)}
          onChange={() => toggleOne(r.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${r.lotReference}`}
        />
      </span>
    ),
  };
  const newColumns = [selectColumn, ...columns];

  const zoneClass = (section: LotSection) =>
    dnd.isOver(section)
      ? 'ring-2 ring-accent bg-accent-soft/30'
      : dnd.canReceive(section)
        ? 'outline outline-2 outline-dashed outline-line'
        : '';

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {pending ? (
        <ConfirmDialog
          tone="default"
          title={pending.length === 1 ? 'Move this lot to Lots?' : `Move ${pending.length} lots to Lots?`}
          body={pending.length === 1 ? 'It leaves Newly arrived and goes into your Lots list. You can drag it back any time.' : 'They leave Newly arrived and go into your Lots list. You can drag them back any time.'}
          meta={
            pending
              .slice(0, 5)
              .map((r) => r.lotReference)
              .join(', ') + (pending.length > 5 ? ` and ${pending.length - 5} more` : '')
          }
          confirmLabel={pending.length === 1 ? 'Move to Lots' : `Move ${pending.length} lots`}
          pending={confirmMove.isPending}
          onConfirm={() => confirmMove.mutate(pending)}
          onClose={() => setPending(null)}
        />
      ) : null}

      {/* ---------------------------------------------- Newly arrived */}
      <Panel className={`transition-shadow ${zoneClass('new')}`}>
        <div {...dnd.zoneProps('new')}>
          <h2 className="m-0">
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={NEW_BODY_ID}
              onClick={() => setStoredCollapsed(!collapsed)}
              className="w-full h-11 px-4 md:px-5 flex items-center gap-2.5 bg-transparent border-0 cursor-pointer text-left text-[13.5px] font-semibold tracking-[-0.005em] text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Chevron open={!collapsed} />
              <span>Newly arrived</span>
              <CountBadge n={newTotal} />
              {dnd.canReceive('new') ? (
                <span className="ml-auto text-[11.5px] font-medium text-ink-3">Drop here to move back</span>
              ) : null}
            </button>
          </h2>
          <div id={NEW_BODY_ID} hidden={collapsed}>
            <div className="border-t border-line-soft p-3 md:p-4 pb-0">
              {newQuery.isError ? (
                <ErrorState
                  message="Couldn't load newly arrived lots."
                  hint="Check your connection and try again."
                  onRetry={() => newQuery.refetch()}
                />
              ) : (
                <>
                {newRows.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-3 min-h-[40px]">
                    <label className="inline-flex items-center gap-2.5 text-[12.5px] text-ink-2 cursor-pointer select-none">
                      <Checkbox checked={allSelected} onChange={toggleAll} />
                      Select all on this page
                    </label>
                    {selected.size > 0 ? (
                      <>
                        <span className="text-[12.5px] font-semibold text-ink tabular-nums">
                          {selected.size} selected
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <GhostButton onClick={() => setSelected(new Set())}>Clear</GhostButton>
                          <PrimaryButton onClick={() => setPending(newRows.filter((r) => selected.has(r.id)))}>
                            Move {selected.size} to Lots
                          </PrimaryButton>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
                <DataTable<LotRow>
                  columns={newColumns}
                  rows={newRows}
                  loading={newQuery.isLoading}
                  emptyMessage="No new lots right now"
                  getRowKey={(r) => r.id}
                  onRowClick={onRowClick}
                  rowProps={dnd.rowProps('new')}
                  rowActions={(r) => (
                    <>
                      <IconButton
                        label={`Move ${r.lotReference} to Lots`}
                        onClick={() => requestMove(r)}
                      >
                        <IconChevronDown size={16} />
                      </IconButton>
                      <LotRowActions row={r} />
                    </>
                  )}
                />
                </>
              )}
            </div>
            {newQuery.data && newQuery.data.total > NEW_PAGE_SIZE ? (
              <Pagination
                page={newPage}
                totalPages={newPages}
                total={newQuery.data.total}
                pageSize={NEW_PAGE_SIZE}
                onPageChange={setNewPage}
                showPageSize={false}
                label="lots"
              />
            ) : null}
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------- Lots */}
      <Panel className={`transition-shadow ${zoneClass('accepted')}`}>
        <div {...dnd.zoneProps('accepted')}>
          <PanelHeader title="Lots">
            <CountBadge n={lotsQuery.data?.total} />
            {dnd.canReceive('accepted') ? (
              <span className="ml-auto text-[11.5px] font-medium text-ink-3">Drop here to move to Lots</span>
            ) : null}
          </PanelHeader>
          <div className="p-3 md:p-4 pb-0">
            {lotsQuery.isError ? (
              <ErrorState
                message="Couldn't load your lots."
                hint="Check your connection and try again."
                onRetry={() => lotsQuery.refetch()}
              />
            ) : (
              <DataTable<LotRow>
                columns={columns}
                rows={lotsQuery.data?.rows ?? []}
                loading={lotsQuery.isLoading}
                emptyMessage="No lots match these filters."
                getRowKey={(r) => r.id}
                onRowClick={onRowClick}
                rowProps={dnd.rowProps('accepted')}
                rowActions={(r) => <LotRowActions row={r} />}
              />
            )}
          </div>
          {lotsQuery.data && lotsQuery.data.total > 0 ? (
            <Pagination
              page={page}
              totalPages={lotsPages}
              total={lotsQuery.data.total}
              pageSize={pageSize}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              label="lots"
            />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
