'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CellValueChangedEvent,
  ColDef,
  ColGroupDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  SelectionChangedEvent,
  ValueSetterParams,
} from 'ag-grid-community';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { AgGridReact, agGridTheme } from '@/components/ui/AgGridShell';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Field, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem, ItemsBulkSet, ItemsGridResponse } from '@/types/items';
import { ItemEditDialog } from './ItemEditDialog';
import { AddItemDialog } from './AddItemDialog';
import { useMe } from '@/hooks/useCan';

/**
 * The lot's Items tab: one AG Grid row per physical item. The assignee fills in
 * the item details and answers the decision questions (Yes / No / blank); the
 * server computes each item's result. Tick rows to set the same values on many
 * items at once. Deciding the last item decides the lot ("split by item").
 */

type Tri = boolean | null;
const TRI_VALUES = ['Yes', 'No', ''] as const;
const triText = (v: Tri) => (v === true ? 'Yes' : v === false ? 'No' : '');
const triParse = (s: unknown): Tri => (s === 'Yes' ? true : s === 'No' ? false : null);

type Filter = 'all' | 'unnamed' | 'undecided' | 'archive' | 'return' | 'discard';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unnamed', label: 'No name' },
  { id: 'undecided', label: 'Undecided' },
  { id: 'archive', label: 'Archive' },
  { id: 'return', label: 'Return' },
  { id: 'discard', label: 'Discard' },
];

type ColumnGroup = 'details' | 'decision' | 'digitization';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function ResultCell({ data }: ICellRendererParams<GridItem>) {
  if (!data) return null;
  if (data.result === 'archive') return <Badge severity="good">Archive</Badge>;
  if (data.result === 'return') return <Badge severity="info">Return</Badge>;
  if (data.result === 'discard') return <Badge severity="critical">Discard</Badge>;
  if (data.verdict === 'return_or_discard') return <Badge severity="warning">Return or discard?</Badge>;
  return <span className="text-ink-4 text-[12px]">Undecided</span>;
}

export function ItemsGrid({ lotId }: { lotId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const narrow = useNarrow();
  const gridApi = useRef<GridApi<GridItem> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [hidden, setHidden] = useState<Record<ColumnGroup, boolean>>({
    details: false,
    decision: false,
    digitization: true,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<GridItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const me = useMe();
  const canAdd = Boolean(me.data?.grants.includes('item:create'));

  const grid = useQuery({
    queryKey: queryKeys.lots.itemsGrid(lotId),
    queryFn: () => itemsGridApi.get(lotId),
  });
  const physical = useReferenceList('physicalSource');
  const conditions = useReferenceList('itemCondition');
  const reasons = useReferenceList('notDigitizedReason');

  const save = useMutation({
    mutationFn: (v: { itemIds: string[]; set: ItemsBulkSet }) => itemsGridApi.update(lotId, v),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
      if (res.finalized) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
        toast.success(
          'Lot decided from its items',
          res.finalized.decision === 'archive'
            ? `Archive — moved to ${res.finalized.stage}. Returns/discards are queued item by item.`
            : `All items ${res.finalized.decision} — the lot moved to ${res.finalized.stage}.`,
        );
      } else if (res.blockedBy.length) {
        toast.info('Every item is decided', res.blockedBy.join(' '));
      }
    },
    onError: (e) => {
      toast.error('Could not save', e instanceof ApiRequestError ? e.message : undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
    },
  });

  const data = grid.data;
  const canDetails = data?.editable.details ?? false;
  const canDecide = data?.editable.decision ?? false;

  const refLabel = useCallback(
    (list: { items: { value: string; label: string }[] } | undefined, v: string | null) =>
      v ? (list?.items.find((i) => i.value === v)?.label ?? v) : '',
    [],
  );

  const columnDefs = useMemo<(ColDef<GridItem> | ColGroupDef<GridItem>)[]>(() => {
    const text = (field: keyof GridItem, headerName: string, width = 160, extra: Partial<ColDef<GridItem>> = {}): ColDef<GridItem> => ({
      field,
      headerName,
      width,
      editable: canDetails,
      cellEditor: 'agTextCellEditor',
      ...extra,
    });
    const refSelect = (
      field: 'physicalSource' | 'itemCondition',
      headerName: string,
      list: { items: { value: string; label: string; active?: boolean }[] } | undefined,
    ): ColDef<GridItem> => ({
      field,
      headerName,
      width: 170,
      editable: canDetails,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['', ...(list?.items ?? []).map((i) => i.value)] },
      valueFormatter: (p) => refLabel(list, p.value as string | null),
      refData: Object.fromEntries((list?.items ?? []).map((i) => [i.value, i.label])),
    });
    const tri = (field: 'existsInMls' | 'newCopyIsBetter' | 'conditionUsable' | 'significant', headerName: string, extra: Partial<ColDef<GridItem>> = {}): ColDef<GridItem> => ({
      colId: field,
      headerName,
      width: 128,
      valueGetter: (p) => triText((p.data?.[field] ?? null) as Tri),
      valueSetter: (p: ValueSetterParams<GridItem>) => {
        if (!p.data) return false;
        (p.data as Record<string, unknown>)[field] = triParse(p.newValue);
        return true;
      },
      editable: canDecide,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: [...TRI_VALUES] },
      ...extra,
    });

    return [
      {
        field: 'code',
        headerName: 'Item code',
        width: narrow ? 150 : 190,
        pinned: 'left',
        cellClass: 'font-mono',
        tooltipValueGetter: () => 'Open the full item form',
        onCellClicked: (p) => p.data && setEditing(p.data),
        cellRenderer: (p: ICellRendererParams<GridItem>) => (
          <button type="button" className="bg-transparent border-0 p-0 text-accent cursor-pointer font-mono text-[12.5px]">
            {p.value as string}
          </button>
        ),
      },
      {
        ...text('name', 'Name / title *', narrow ? 170 : 240),
        pinned: narrow ? undefined : 'left',
        cellClassRules: { 'ag-cell-missing': (p) => !p.value },
      },
      {
        field: 'subtypeLabel',
        headerName: 'Media type',
        width: 170,
        valueGetter: (p) => (p.data ? `${p.data.format} · ${p.data.subtypeLabel}` : ''),
      },
      {
        headerName: 'Details',
        children: ([
          text('nameOnCase', 'Name on case', 180),
          text('description', 'Description', 240, { cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true, cellEditorParams: { maxLength: 4000, rows: 6, cols: 50 } }),
          {
            field: 'year',
            headerName: 'Year',
            width: 96,
            editable: canDetails,
            cellEditor: 'agNumberCellEditor',
            cellEditorParams: { min: 1800, max: 2200, precision: 0 },
          },
          text('month', 'Month', 96),
          text('place', 'Place', 150),
          text('event', 'Event', 180),
          text('people', 'People', 180),
          refSelect('physicalSource', 'Physical source', physical.data),
          refSelect('itemCondition', 'Condition', conditions.data),
          text('remarks', 'Remarks', 200),
        ] as ColDef<GridItem>[]).map((c) => ({ ...c, hide: hidden.details })),
      },
      {
        headerName: 'Decision',
        children: ([
          tri('existsInMls', 'In MLS?'),
          tri('newCopyIsBetter', 'New copy better?', {
            width: 150,
            editable: (p) => canDecide && p.data?.existsInMls === true,
          }),
          tri('conditionUsable', 'Usable?'),
          tri('significant', 'Significant?'),
          { colId: 'result', headerName: 'Result', width: 170, cellRenderer: ResultCell },
          {
            field: 'disposition',
            headerName: 'Return / discard',
            width: 150,
            editable: (p) => canDecide && p.data?.verdict === 'return_or_discard',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['', 'return', 'discard'] },
            valueFormatter: (p) => (p.value === 'return' ? 'Return' : p.value === 'discard' ? 'Discard' : ''),
          },
          {
            field: 'reason',
            headerName: 'Reason',
            width: 220,
            editable: (p) => canDecide && p.data?.verdict === 'return_or_discard',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['', ...(reasons.data?.items ?? []).map((i) => i.value)] },
            valueFormatter: (p) => refLabel(reasons.data, p.value as string | null),
          },
        ] as ColDef<GridItem>[]).map((c) => ({ ...c, hide: hidden.decision })),
      },
      {
        headerName: 'Digitization',
        children: ([
          {
            field: 'captureStatus',
            headerName: 'Capture',
            width: 120,
            valueFormatter: (p) => (p.value === 'captured' ? 'Captured' : p.value === 'missing' ? 'Missing' : 'Not started'),
          },
          { field: 'digitalSource', headerName: 'Digital source', width: 150 },
          { field: 'fileName', headerName: 'File', width: 220 },
          { field: 'taggedInMls', headerName: 'MLS tagged', width: 110, valueFormatter: (p) => (p.value ? 'Yes' : '–') },
          { field: 'mlsDuplicateOf', headerName: 'Duplicate of', width: 160 },
        ] as ColDef<GridItem>[]).map((c) => ({ ...c, hide: hidden.digitization })),
      },
    ];
  }, [canDetails, canDecide, narrow, hidden, physical.data, conditions.data, reasons.data, refLabel]);

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    switch (filter) {
      case 'unnamed':
        return all.filter((r) => !r.name);
      case 'undecided':
        return all.filter((r) => !r.result);
      case 'archive':
      case 'return':
      case 'discard':
        return all.filter((r) => r.result === filter);
      default:
        return all;
    }
  }, [data, filter]);

  const onCellValueChanged = (e: CellValueChangedEvent<GridItem>) => {
    if (!e.data) return;
    const colId = e.column.getColId();
    const field = (colId === 'subtypeLabel' ? null : colId) as keyof ItemsBulkSet | null;
    if (!field) return;
    let value: unknown = (e.data as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.trim() === '') value = null;
    if (field === 'year' && value !== null) value = Number(value);
    save.mutate({ itemIds: [e.data.id], set: { [field]: value } as ItemsBulkSet });
  };

  const onSelectionChanged = (e: SelectionChangedEvent<GridItem>) =>
    setSelected(e.api.getSelectedRows().map((r) => r.id));

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
  return (
    <Panel>
      <PanelHeader title={`Items (${s.total})`}>
        {canAdd && canDetails ? (
          <span className="ml-auto">
            <GhostButton onClick={() => setShowAdd(true)}>Add item</GhostButton>
          </span>
        ) : null}
      </PanelHeader>
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
          <span>
            <span className="font-semibold text-ink tabular-nums">{s.decided}</span> of {s.total} decided
          </span>
          <span>
            <span className="font-semibold text-ink tabular-nums">{s.named}</span> named
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Badge severity="good">Archive {s.archive}</Badge>
            <Badge severity="info">Return {s.return}</Badge>
            <Badge severity="critical">Discard {s.discard}</Badge>
          </span>
        </div>

        {!canDetails ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Read only — only the lot&apos;s assignee and admins can fill in items.
          </p>
        ) : !canDecide ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Decisions are locked — this lot has been decided. Item details stay editable.
          </p>
        ) : (
          <p className="m-0 text-[12px] text-ink-3 max-w-[90ch]">
            Give each item a name, then answer the questions. The result is worked out for you; for “Return or discard?”
            pick which and a reason. When every item is decided, the lot moves on by itself.
          </p>
        )}
        {data.blockedBy.length ? (
          <div role="note" className="rounded-[6px] border border-line bg-surface-sunken px-3 py-2 text-[12.5px] text-ink-2">
            {data.blockedBy.join(' ')}
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
          <div role="group" aria-label="Column groups" className="flex flex-wrap gap-3 sm:ml-auto text-[12px] text-ink-2">
            {(['details', 'decision', 'digitization'] as ColumnGroup[]).map((g) => (
              <label key={g} className="flex items-center gap-1.5 min-h-[32px] cursor-pointer capitalize">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={!hidden[g]}
                  onChange={(e) => setHidden((prev) => ({ ...prev, [g]: !e.target.checked }))}
                />
                {g}
              </label>
            ))}
          </div>
        </div>

        {selected.length > 0 && canDetails ? (
          <BulkBar
            count={selected.length}
            canDecide={canDecide}
            physical={physical.data?.items ?? []}
            conditions={conditions.data?.items ?? []}
            reasons={reasons.data?.items ?? []}
            pending={save.isPending}
            onApply={(set) =>
              save.mutate(
                { itemIds: selected, set },
                {
                  onSuccess: (res) => {
                    toast.success(`Updated ${res.updated} ${res.updated === 1 ? 'item' : 'items'}`);
                    gridApi.current?.deselectAll();
                  },
                },
              )
            }
            onClear={() => gridApi.current?.deselectAll()}
          />
        ) : null}

        <div className="w-full h-[calc(100dvh-320px)] min-h-[420px]">
          <AgGridReact<GridItem>
            theme={agGridTheme}
            rowData={rows}
            columnDefs={columnDefs}
            getRowId={(p) => p.data.id}
            rowSelection={canDetails ? { mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false } : undefined}
            selectionColumnDef={{ pinned: 'left', width: 48 }}
            onGridReady={(e: GridReadyEvent<GridItem>) => {
              gridApi.current = e.api;
            }}
            onSelectionChanged={onSelectionChanged}
            onCellValueChanged={onCellValueChanged}
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            enterNavigatesVerticallyAfterEdit
            tooltipShowDelay={400}
            overlayNoRowsTemplate="<span>No items match this filter.</span>"
          />
        </div>
      </div>

      {showAdd ? (
        <AddItemDialog
          lotId={lotId}
          onClose={() => {
            setShowAdd(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
          }}
        />
      ) : null}
      {editing ? (
        <ItemEditDialog
          item={editing}
          canDetails={canDetails}
          canDecide={canDecide}
          physical={physical.data?.items ?? []}
          conditions={conditions.data?.items ?? []}
          reasons={reasons.data?.items ?? []}
          pending={save.isPending}
          onSave={(set) => save.mutate({ itemIds: [editing.id], set }, { onSuccess: () => setEditing(null) })}
          onClose={() => setEditing(null)}
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
  conditions,
  reasons,
  pending,
  onApply,
  onClear,
}: {
  count: number;
  canDecide: boolean;
  physical: Opt[];
  conditions: Opt[];
  reasons: Opt[];
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
  const refSel = (k: string, label: string, opts: Opt[]) => (
    <Field label={label}>
      <Select value={v[k] ?? ''} onChange={set(k)} aria-label={`${label} for selected items`}>
        <option value="">No change</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  const apply = () => {
    const out: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(v)) {
      if (raw === '') continue;
      if (['existsInMls', 'newCopyIsBetter', 'conditionUsable', 'significant'].includes(k)) {
        out[k] = raw === '__clear' ? null : raw === 'Yes';
      } else if (k === 'year') {
        out[k] = Number(raw);
      } else {
        out[k] = raw;
      }
    }
    if (Object.keys(out).length === 0) return;
    onApply(out as ItemsBulkSet);
  };

  return (
    <section
      aria-label="Bulk edit selected items"
      className="rounded-[8px] border border-accent bg-accent-soft p-3 flex flex-col gap-3"
    >
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
            {triSel('existsInMls', 'In MLS?')}
            {triSel('newCopyIsBetter', 'New copy better?')}
            {triSel('conditionUsable', 'Usable?')}
            {triSel('significant', 'Significant?')}
            <Field label="Return / discard">
              <Select value={v.disposition ?? ''} onChange={set('disposition')} aria-label="Return or discard for selected items">
                <option value="">No change</option>
                <option value="return">Return</option>
                <option value="discard">Discard</option>
              </Select>
            </Field>
            {refSel('reason', 'Reason', reasons)}
          </>
        ) : null}
        {refSel('physicalSource', 'Physical source', physical)}
        {refSel('itemCondition', 'Condition', conditions)}
        <Field label="Place">
          <TextInput value={v.place ?? ''} onChange={set('place')} placeholder="No change" />
        </Field>
        <Field label="Event">
          <TextInput value={v.event ?? ''} onChange={set('event')} placeholder="No change" />
        </Field>
        <Field label="Year">
          <TextInput value={v.year ?? ''} onChange={set('year')} placeholder="No change" inputMode="numeric" />
        </Field>
        <Field label="Month">
          <TextInput value={v.month ?? ''} onChange={set('month')} placeholder="No change" />
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
