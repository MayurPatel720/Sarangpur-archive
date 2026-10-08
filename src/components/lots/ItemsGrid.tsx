'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GridApi } from 'ag-grid-community';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Field, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconPlus } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { allColumns, deptLabel, type CustomColumn, type DeptId } from '@/lib/item-columns';
import type { ColumnsBody, GridItem, ItemsBulkSet, ItemsGridResponse } from '@/types/items';
import { AddItemDialog } from './AddItemDialog';
import { AddColumnDialog } from './AddColumnDialog';
import { DuplicateDialog } from './DuplicateDialog';
import { exportItemsToExcel } from './excel-io';
import { HiddenColumnsMenu } from './HiddenColumnsMenu';
import { ImportDialog } from './ImportDialog';
import { ItemCodeDialog } from './ItemCodeDialog';
import { ItemFamilyGrid } from './ItemFamilyGrid';
import { useMe } from '@/hooks/useCan';

/**
 * The lot's Items tab — the lot's Excel: one collapsible sheet per media type, columns in
 * four departments (Details · Decision · Digitalization & Storage · Logging; see
 * src/lib/item-columns.ts). Column headers hide a column on click, "⋯" brings hidden ones
 * back and "+" adds a column of the team's own — both shared by everyone on THIS lot.
 * Rows can be dragged to reorder. Excel export / import sit top right. Deciding the last item
 * decides the lot, and the lot's stage then follows capture / MLS / logging by itself.
 */

type Filter = 'all' | 'undecided' | 'archive' | 'discard' | 'physical';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'undecided', label: 'Undecided' },
  { id: 'archive', label: 'Digitize' },
  { id: 'discard', label: 'Discard' },
  { id: 'physical', label: 'Keep physical' },
];

const ROW_PX = 42;
const matchesFilter = (r: GridItem, f: Filter) =>
  f === 'all' ? true : f === 'undecided' ? !r.result : r.result === f;

const SELECTION_CLEAR: Record<number, string[]> = {};

export function ItemsGrid({ lotId, lotReference }: { lotId: string; lotReference: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const gridApis = useRef<Map<number, GridApi<GridItem>>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  /** Explicit open/closed per sheet; null until the user touches it (then: first sheet open). */
  const [expanded, setExpanded] = useState<Record<number, boolean> | null>(null);
  const [selectedBy, setSelectedBy] = useState<Record<number, string[]>>(SELECTION_CLEAR);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [columnError, setColumnError] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<GridItem | null>(null);
  const [duplicateFor, setDuplicateFor] = useState<{ item: GridItem; code: string } | null>(null);
  const [deleteColumn, setDeleteColumn] = useState<CustomColumn | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** View only: show just one department's columns (not saved). */
  const [onlyDept, setOnlyDept] = useState<DeptId | null>(null);
  const me = useMe();
  const canAdd = Boolean(me.data?.grants.includes('item:create'));

  const gridKey = queryKeys.lots.itemsGrid(lotId);
  const grid = useQuery({ queryKey: gridKey, queryFn: () => itemsGridApi.get(lotId) });
  const physical = useReferenceList('physicalSource');
  const physicalItems = useMemo(() => physical.data?.items ?? [], [physical.data]);
  const refLabel = useCallback(
    (_list: string, v: string | null) => (v ? (physicalItems.find((i) => i.value === v)?.label ?? v) : ''),
    [physicalItems],
  );

  const refresh = () => void queryClient.invalidateQueries({ queryKey: gridKey });

  const save = useMutation({
    mutationFn: (v: { itemIds: string[]; set: ItemsBulkSet }) => itemsGridApi.update(lotId, v),
    onSuccess: (res) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      if (res.finalized) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
        toast.success('Lot decided from its items', `Moved to ${res.finalized.stage}.`);
      } else if (res.blockedBy.length) {
        toast.info('Every item is decided', res.blockedBy.join(' '));
      }
    },
    onError: (e) => {
      toast.error('Could not save', e instanceof ApiRequestError ? e.message : undefined);
      refresh();
    },
  });

  const reorder = useMutation({
    mutationFn: (v: { lineIndex: number; orderedIds: string[] }) => itemsGridApi.reorder(lotId, v),
    onSuccess: refresh,
    onError: (e) => {
      toast.error('Could not move the row', e instanceof ApiRequestError ? e.message : undefined);
      refresh();
    },
  });

  /** Hide / unhide / add / remove a column. Hiding is applied at once and rolled back on failure. */
  const columns = useMutation({
    mutationFn: (b: ColumnsBody) => itemsGridApi.columns(lotId, b),
    onMutate: async (b) => {
      if (!b.hidden) return undefined;
      await queryClient.cancelQueries({ queryKey: gridKey });
      const prev = queryClient.getQueryData<ItemsGridResponse>(gridKey);
      if (prev) queryClient.setQueryData<ItemsGridResponse>(gridKey, { ...prev, hiddenColumns: b.hidden });
      return { prev };
    },
    onSuccess: (_r, b) => {
      refresh();
      if (b.add) {
        setShowAddColumn(false);
        toast.success('Column added', b.add.label);
      }
      if (b.removeKey) {
        setDeleteColumn(null);
        toast.success('Column deleted');
      }
    },
    onError: (e, b, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(gridKey, ctx.prev);
      const message = e instanceof ApiRequestError ? e.message : 'Could not change the columns.';
      if (b.add) setColumnError(message);
      else toast.error('Could not change the columns', message);
    },
  });

  const data = grid.data;
  const canDetails = data?.editable.details ?? false;
  const canDecide = data?.editable.decision ?? false;

  const specs = useMemo(() => allColumns(data?.customColumns ?? []), [data?.customColumns]);
  const hiddenIds = useMemo(() => new Set(data?.hiddenColumns ?? []), [data?.hiddenColumns]);
  const visibleSpecs = useMemo(
    () => specs.filter((s) => !hiddenIds.has(s.id) && (onlyDept === null || s.dept === onlyDept || s.kind === 'code')),
    [specs, hiddenIds, onlyDept],
  );
  const hiddenSpecs = useMemo(() => specs.filter((s) => hiddenIds.has(s.id)), [specs, hiddenIds]);

  /** One sheet per media line, in intake order, with every item (for progress) and the filtered rows. */
  const sheets = useMemo(() => {
    const map = new Map<number, { name: string; all: GridItem[]; rows: GridItem[] }>();
    for (const it of data?.items ?? []) {
      let g = map.get(it.lineIndex);
      if (!g) map.set(it.lineIndex, (g = { name: it.subtypeLabel.trim() || 'Other', all: [], rows: [] }));
      g.all.push(it);
      if (matchesFilter(it, filter)) g.rows.push(it);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([lineIndex, g]) => ({ lineIndex, ...g }));
  }, [data, filter]);

  const isOpen = (line: number, index: number) => (expanded ? (expanded[line] ?? false) : index === 0);
  const setAll = (open: boolean) => setExpanded(Object.fromEntries(sheets.map((s) => [s.lineIndex, open])));
  const toggle = (line: number) =>
    setExpanded(Object.fromEntries(sheets.map((s, i) => [s.lineIndex, s.lineIndex === line ? !isOpen(s.lineIndex, i) : isOpen(s.lineIndex, i)])));

  const selected = useMemo(() => Object.values(selectedBy).flat(), [selectedBy]);
  const onSelectionChange = useCallback(
    (sheet: number, ids: string[]) =>
      setSelectedBy((prev) => {
        const cur = prev[sheet] ?? [];
        if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return prev;
        if (ids.length === 0 && !(sheet in prev)) return prev;
        return { ...prev, [sheet]: ids };
      }),
    [],
  );
  const onApi = useCallback((sheet: number, api: GridApi<GridItem> | null) => {
    if (api) gridApis.current.set(sheet, api);
    else gridApis.current.delete(sheet);
  }, []);
  const deselectAll = () => gridApis.current.forEach((api) => api.deselectAll());
  const onSave = useCallback((itemIds: string[], set: ItemsBulkSet) => save.mutate({ itemIds, set }), [save]);
  const onReorder = useCallback((lineIndex: number, orderedIds: string[]) => reorder.mutate({ lineIndex, orderedIds }), [reorder]);

  const hideColumn = useCallback(
    (id: string) => columns.mutate({ hidden: [...(data?.hiddenColumns ?? []), id] }),
    [columns, data?.hiddenColumns],
  );
  const hideDept = useCallback(
    (dept: DeptId) => {
      const ids = specs.filter((c) => c.dept === dept && c.kind !== 'code').map((c) => c.id);
      columns.mutate({ hidden: [...new Set([...(data?.hiddenColumns ?? []), ...ids])] });
      setOnlyDept(null);
    },
    [columns, specs, data?.hiddenColumns],
  );
  const showColumn = (id: string) => columns.mutate({ hidden: (data?.hiddenColumns ?? []).filter((h) => h !== id) });
  const onInvalid = useCallback((message: string) => toast.error('Not saved', message), [toast]);
  const onOpenCode = useCallback((item: GridItem) => setCodeFor(item), []);
  const onDuplicate = useCallback((item: GridItem, code: string) => setDuplicateFor({ item, code }), []);

  const exportExcel = async () => {
    if (!data) return;
    try {
      await exportItemsToExcel({
        fileName: `${lotReference}-items`,
        sheets: sheets.map((s) => ({ name: s.name, rows: s.all })),
        columns: visibleSpecs,
        refLabel,
      });
    } catch {
      toast.error('Could not export', 'Try again, or reload the page.');
    }
  };

  // Full screen: lock page scroll; Escape exits (unless a dialog or a cell editor/popup is using it).
  const dialogOpen = showAdd || showImport || showAddColumn || Boolean(codeFor) || Boolean(duplicateFor) || Boolean(deleteColumn);
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || dialogOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('.ag-cell-inline-editing, .ag-popup, .ag-cell-editing-error')) return;
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, dialogOpen]);

  if (grid.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Items" />
        <div className="p-4 flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Panel>
    );
  }
  if (grid.isError || !data) {
    return (
      <Panel>
        <ErrorState message="Couldn't load the items." onRetry={() => grid.refetch()} />
      </Panel>
    );
  }

  const s = data.summary;
  const single = sheets.length <= 1;
  const canReorder = canDetails && filter === 'all';

  const gridHeight = (rowCount: number) => {
    if (single) return fullscreen ? '100%' : 'max(420px, calc(100dvh - 320px))';
    const natural = 100 + rowCount * ROW_PX;
    return fullscreen ? `min(${natural}px, calc(100dvh - 200px))` : `${Math.min(natural, 560)}px`;
  };

  const iconBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-2 cursor-pointer hover:bg-accent-soft disabled:opacity-50';

  return (
    <Panel>
      <PanelHeader title={`Items (${s.total})`}>
        <span className="ml-auto flex items-center gap-2">
          <GhostButton onClick={() => setFullscreen(true)}>Full screen</GhostButton>
          {canAdd && canDetails ? <GhostButton onClick={() => setShowAdd(true)}>Add item</GhostButton> : null}
        </span>
      </PanelHeader>
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
          <span>
            <span className="font-semibold text-ink tabular-nums">{s.decided}</span> of {s.total} decided
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Badge severity="good">Digitize {s.archive}</Badge>
            <Badge severity="critical">Discard {s.discard}</Badge>
            <Badge severity="neutral">Keep physical {s.physical}</Badge>
          </span>
        </div>

        {!canDetails ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Read only — only the lot&apos;s assignee and admins can fill in items.
          </p>
        ) : !canDecide ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Decisions are locked — this lot has been decided. The other columns stay editable.
          </p>
        ) : (
          <p className="m-0 text-[12px] text-ink-3 max-w-[90ch]">
            Fill in each row, then answer digital, redigital and discard (Yes / No). When every item is decided, the lot
            moves on by itself.
          </p>
        )}
        {data.blockedBy.length ? (
          <div role="note" className="rounded-[6px] border border-line bg-surface-sunken px-3 py-2 text-[12.5px] text-ink-2">
            {data.blockedBy.join(' ')}
          </div>
        ) : null}

        {/* The spreadsheet part. Same element in both modes (class swap, no portal) so grids never remount. */}
        <div
          className={
            fullscreen
              ? 'fixed inset-0 z-[90] bg-surface text-ink flex flex-col gap-3 p-3 md:p-4'
              : 'flex flex-col gap-3'
          }
        >
          {fullscreen ? (
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold text-ink">Items ({s.total})</h2>
              <GhostButton onClick={() => setFullscreen(false)} className="ml-auto">
                Exit full screen
              </GhostButton>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show items" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`min-h-[32px] px-2.5 rounded-[6px] border text-[12px] font-semibold cursor-pointer ${
                    filter === f.id ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink-2'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {onlyDept ? (
              <button
                type="button"
                onClick={() => setOnlyDept(null)}
                className="min-h-[32px] px-2.5 rounded-[6px] border border-accent bg-accent-soft text-[12px] font-semibold text-accent cursor-pointer"
              >
                Showing {deptLabel(onlyDept)} only ✕
              </button>
            ) : null}
            {!single ? (
              <div role="group" aria-label="Sheets" className="flex gap-1.5">
                <GhostButton onClick={() => setAll(true)}>Expand all</GhostButton>
                <GhostButton onClick={() => setAll(false)}>Collapse all</GhostButton>
              </div>
            ) : null}
            <div role="toolbar" aria-label="Excel tools" className="flex items-center gap-1.5 sm:ml-auto">
              {canDetails ? (
                <GhostButton onClick={() => setShowImport(true)}>Import</GhostButton>
              ) : null}
              <GhostButton onClick={() => void exportExcel()} disabled={s.total === 0}>
                Export
              </GhostButton>
              {canDetails ? (
                <button
                  type="button"
                  className={iconBtn}
                  aria-label="Add a column"
                  title="Add a column"
                  onClick={() => {
                    setColumnError(null);
                    setShowAddColumn(true);
                  }}
                >
                  <IconPlus size={15} />
                </button>
              ) : null}
              <HiddenColumnsMenu hidden={hiddenSpecs} onShow={showColumn} onShowAll={() => columns.mutate({ hidden: [] })} />
            </div>
          </div>

          {selected.length > 0 && canDetails ? (
            <BulkBar
              count={selected.length}
              canDecide={canDecide}
              physical={physicalItems}
              pending={save.isPending}
              onApply={(set) =>
                save.mutate(
                  { itemIds: selected, set },
                  {
                    onSuccess: (res) => {
                      toast.success(`Updated ${res.updated} ${res.updated === 1 ? 'item' : 'items'}`);
                      deselectAll();
                    },
                  },
                )
              }
              onClear={deselectAll}
            />
          ) : null}

          <div className={fullscreen ? 'flex-1 min-h-0 overflow-y-auto flex flex-col gap-3' : 'flex flex-col gap-3'}>
            {sheets.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No items yet.</p> : null}
            {sheets.map((sh, i) => {
              const open = isOpen(sh.lineIndex, i);
              const gridBox = (
                <ItemFamilyGrid
                  lineIndex={sh.lineIndex}
                  rows={sh.rows}
                  columns={visibleSpecs}
                  canDetails={canDetails}
                  canDecide={canDecide}
                  canReorder={canReorder}
                  physical={physicalItems}
                  height={gridHeight(sh.rows.length)}
                  onOpenCode={onOpenCode}
                  onDuplicate={onDuplicate}
                  onHide={hideColumn}
                  onDeleteColumn={setDeleteColumn}
                  onShowOnly={setOnlyDept}
                  onHideDept={hideDept}
                  onlyDept={onlyDept}
                  onInvalid={onInvalid}
                  onSave={onSave}
                  onReorder={onReorder}
                  onSelectionChange={onSelectionChange}
                  onApi={onApi}
                />
              );
              if (single) {
                return (
                  <div key={sh.lineIndex} className={fullscreen ? 'flex-1 min-h-0' : undefined}>
                    {gridBox}
                  </div>
                );
              }
              const decided = sh.all.filter((r) => r.result).length;
              const captured = sh.all.filter((r) => r.captured).length;
              const tagged = sh.all.filter((r) => r.taggedInMls).length;
              const empty = sh.rows.length === 0;
              return (
                <section key={sh.lineIndex} aria-label={`${sh.name} items`} className="rounded-[8px] border border-line overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open && !empty}
                    disabled={empty}
                    onClick={() => toggle(sh.lineIndex)}
                    className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-surface-sunken border-0 text-left ${
                      empty ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <span aria-hidden className="text-ink-3 text-[12px] w-3">
                      {open && !empty ? '▾' : '▸'}
                    </span>
                    <span className="text-[13px] font-semibold text-ink">{sh.name}</span>
                    <span className="text-[12px] text-ink-2 tabular-nums">
                      {empty ? `0 match (of ${sh.all.length})` : `${sh.rows.length}${sh.rows.length === sh.all.length ? '' : ` of ${sh.all.length}`} ${sh.all.length === 1 ? 'item' : 'items'}`}
                    </span>
                    <span className="text-[12px] text-ink-3 tabular-nums sm:ml-auto">
                      {decided}/{sh.all.length} decided · {captured} captured · {tagged} tagged
                    </span>
                  </button>
                  {open && !empty ? <div className="border-t border-line">{gridBox}</div> : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {showAdd ? (
        <AddItemDialog
          lotId={lotId}
          onClose={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      ) : null}
      {showImport ? <ImportDialog lotId={lotId} onClose={() => setShowImport(false)} onDone={refresh} /> : null}
      {showAddColumn ? (
        <AddColumnDialog
          pending={columns.isPending}
          error={columnError}
          onAdd={(add) => columns.mutate({ add })}
          onClose={() => setShowAddColumn(false)}
        />
      ) : null}
      {codeFor ? (
        <ItemCodeDialog
          lotId={lotId}
          item={codeFor}
          sheetName={sheets.find((x) => x.lineIndex === codeFor.lineIndex)?.name ?? 'Sheet'}
          sheetItems={sheets.find((x) => x.lineIndex === codeFor.lineIndex)?.all ?? []}
          onClose={() => setCodeFor(null)}
          onDone={refresh}
        />
      ) : null}
      {duplicateFor ? (
        <DuplicateDialog
          lotId={lotId}
          item={duplicateFor.item}
          otherCode={duplicateFor.code}
          onClose={() => setDuplicateFor(null)}
          onDone={() => {
            refresh();
            void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
          }}
        />
      ) : null}
      {deleteColumn ? (
        <ConfirmDialog
          title="Delete this column?"
          body={`“${deleteColumn.label}” and everything typed in it will be removed from this lot's Excel.`}
          confirmLabel="Delete column"
          pending={columns.isPending}
          onConfirm={() => columns.mutate({ removeKey: deleteColumn.key })}
          onClose={() => setDeleteColumn(null)}
        />
      ) : null}
    </Panel>
  );
}

type Opt = { value: string; label: string };

/** Set the same values on every ticked row. Blank = leave as is. */
function BulkBar({
  count,
  canDecide,
  physical,
  pending,
  onApply,
  onClear,
}: {
  count: number;
  canDecide: boolean;
  physical: Opt[];
  pending: boolean;
  onApply: (set: ItemsBulkSet) => void;
  onClear: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const triSel = (k: string, label: string) => (
    <Field label={label}>
      <Select value={v[k] ?? ''} onChange={set(k)} aria-label={`${label} for selected items`}>
        <option value="">No change</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
        <option value="__clear">Clear</option>
      </Select>
    </Field>
  );
  const txt = (k: string, label: string) => (
    <Field label={label}>
      <TextInput value={v[k] ?? ''} onChange={set(k)} placeholder="No change" />
    </Field>
  );

  const apply = () => {
    const out: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(v)) {
      if (raw === '') continue;
      if (['digital', 'redigital', 'discard'].includes(k)) out[k] = raw === '__clear' ? null : raw === 'Yes';
      else if (k === 'logged') out[k] = raw === 'Yes';
      else out[k] = raw;
    }
    if (Object.keys(out).length === 0) return;
    onApply(out as ItemsBulkSet);
  };

  return (
    <section aria-label="Bulk edit selected items" className="rounded-[8px] border border-accent bg-accent-soft p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">
          Set for {count} selected {count === 1 ? 'item' : 'items'}
        </span>
        <span className="text-[12px] text-ink-3">Blank fields are left as they are.</span>
        <GhostButton onClick={onClear} className="sm:ml-auto">
          Clear selection
        </GhostButton>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {canDecide ? (
          <>
            {triSel('digital', 'Digital')}
            {triSel('redigital', 'Redigital')}
            {triSel('discard', 'Discard')}
          </>
        ) : null}
        <Field label="Phy source">
          <Select value={v.physicalSource ?? ''} onChange={set('physicalSource')} aria-label="Phy source for selected items">
            <option value="">No change</option>
            {physical.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Return / discard">
          <Select value={v.disposition ?? ''} onChange={set('disposition')} aria-label="Return or discard for selected items">
            <option value="">No change</option>
            <option value="return">Return</option>
            <option value="discard">Discard</option>
          </Select>
        </Field>
        {txt('place', 'Place')}
        {txt('senderCode', "Sender's code")}
        {txt('digitalSource', 'Dig source')}
        {txt('phyStorageLoc', 'Phy storage loc.')}
        <Field label="Logging status">
          <Select value={v.logged ?? ''} onChange={set('logged')} aria-label="Logging status for selected items">
            <option value="">No change</option>
            <option value="Yes">Logged</option>
            <option value="No">Not logged</option>
          </Select>
        </Field>
      </div>
      <div>
        <PrimaryButton disabled={pending} onClick={apply}>
          {pending ? 'Saving…' : `Apply to ${count}`}
        </PrimaryButton>
      </div>
    </section>
  );
}
