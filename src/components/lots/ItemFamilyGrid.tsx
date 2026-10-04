'use client';

import { useMemo } from 'react';
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
import { AgGridReact, agGridTheme } from '@/components/ui/AgGridShell';
import { Badge } from '@/components/ui/primitives';
import { detailColumnsFor, type DetailColumnKey } from '@/lib/item-columns';
import type { GridItem, ItemsBulkSet } from '@/types/items';

/**
 * One AG Grid for the items of one media-subtype family. Owns its own select-all,
 * sort and column widths; ItemsGrid owns filters, column-group toggles, saving and
 * the bulk bar, and passes them in.
 */

export type ColumnGroup = 'details' | 'decision' | 'digitization';
type Tri = boolean | null;
type Opt = { value: string; label: string };
const TRI_VALUES = ['Yes', 'No', ''] as const;
const triText = (v: Tri) => (v === true ? 'Yes' : v === false ? 'No' : '');
const triParse = (s: unknown): Tri => (s === 'Yes' ? true : s === 'No' ? false : null);

function ResultCell({ data }: ICellRendererParams<GridItem>) {
  if (!data) return null;
  if (data.result === 'archive') return <Badge severity="good">Archive</Badge>;
  if (data.result === 'return') return <Badge severity="info">Return</Badge>;
  if (data.result === 'discard') return <Badge severity="critical">Discard</Badge>;
  if (data.verdict === 'return_or_discard') return <Badge severity="warning">Return or discard?</Badge>;
  return <span className="text-ink-4 text-[12px]">Undecided</span>;
}

export function ItemFamilyGrid({
  family,
  rows,
  hidden,
  canDetails,
  canDecide,
  narrow,
  physical,
  conditions,
  reasons,
  height,
  onEdit,
  onSave,
  onSelectionChange,
  onApi,
}: {
  family: string;
  rows: GridItem[];
  hidden: Record<ColumnGroup, boolean>;
  canDetails: boolean;
  canDecide: boolean;
  narrow: boolean;
  physical: Opt[];
  conditions: Opt[];
  reasons: Opt[];
  /** CSS height of the grid box. */
  height: string;
  onEdit: (item: GridItem) => void;
  onSave: (itemIds: string[], set: ItemsBulkSet) => void;
  onSelectionChange: (family: string, ids: string[]) => void;
  onApi: (family: string, api: GridApi<GridItem> | null) => void;
}) {
  const columnDefs = useMemo<(ColDef<GridItem> | ColGroupDef<GridItem>)[]>(() => {
    const refLabel = (list: Opt[], v: string | null) => (v ? (list.find((i) => i.value === v)?.label ?? v) : '');
    const text = (field: keyof GridItem, headerName: string, width = 160, extra: Partial<ColDef<GridItem>> = {}): ColDef<GridItem> => ({
      field,
      headerName,
      width,
      editable: canDetails,
      cellEditor: 'agTextCellEditor',
      ...extra,
    });
    const refSelect = (field: 'physicalSource' | 'itemCondition', headerName: string, list: Opt[]): ColDef<GridItem> => ({
      field,
      headerName,
      width: 170,
      editable: canDetails,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['', ...list.map((i) => i.value)] },
      valueFormatter: (p) => refLabel(list, p.value as string | null),
      refData: Object.fromEntries(list.map((i) => [i.value, i.label])),
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

    const detailDefs: Record<DetailColumnKey, ColDef<GridItem>> = {
      nameOnCase: text('nameOnCase', 'Name on case', 180),
      description: text('description', 'Description', 240, { cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true, cellEditorParams: { maxLength: 4000, rows: 6, cols: 50 } }),
      year: {
        field: 'year',
        headerName: 'Year',
        width: 96,
        editable: canDetails,
        cellEditor: 'agNumberCellEditor',
        cellEditorParams: { min: 1800, max: 2200, precision: 0 },
      },
      month: text('month', 'Month', 96),
      place: text('place', 'Place', 150),
      event: text('event', 'Event', 180),
      people: text('people', 'People', 180),
      physicalSource: refSelect('physicalSource', 'Physical source', physical),
      itemCondition: refSelect('itemCondition', 'Condition', conditions),
      remarks: text('remarks', 'Remarks', 200),
    };
    const details = detailColumnsFor(family).map((k) => ({ ...detailDefs[k], hide: hidden.details }));

    return [
      {
        field: 'code',
        headerName: 'Item code',
        width: narrow ? 150 : 190,
        pinned: 'left',
        cellClass: 'font-mono',
        tooltipValueGetter: () => 'Open the full item form',
        onCellClicked: (p) => p.data && onEdit(p.data),
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
      { headerName: 'Details', children: details },
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
            cellEditorParams: { values: ['', ...reasons.map((i) => i.value)] },
            valueFormatter: (p) => refLabel(reasons, p.value as string | null),
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
  }, [family, canDetails, canDecide, narrow, hidden, physical, conditions, reasons, onEdit]);

  const onCellValueChanged = (e: CellValueChangedEvent<GridItem>) => {
    if (!e.data) return;
    const colId = e.column.getColId();
    const field = (colId === 'subtypeLabel' ? null : colId) as keyof ItemsBulkSet | null;
    if (!field) return;
    let value: unknown = (e.data as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.trim() === '') value = null;
    if (field === 'year' && value !== null) value = Number(value);
    onSave([e.data.id], { [field]: value } as ItemsBulkSet);
  };

  return (
    <div className="w-full min-h-[160px]" style={{ height }}>
      <AgGridReact<GridItem>
        theme={agGridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        rowSelection={canDetails ? { mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false } : undefined}
        selectionColumnDef={{ pinned: 'left', width: 48 }}
        onGridReady={(e: GridReadyEvent<GridItem>) => onApi(family, e.api)}
        onGridPreDestroyed={() => {
          onApi(family, null);
          onSelectionChange(family, []);
        }}
        onSelectionChanged={(e: SelectionChangedEvent<GridItem>) =>
          onSelectionChange(family, e.api.getSelectedRows().map((r) => r.id))
        }
        onCellValueChanged={onCellValueChanged}
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        enterNavigatesVerticallyAfterEdit
        tooltipShowDelay={400}
        overlayNoRowsTemplate="<span>No items match this filter.</span>"
      />
    </div>
  );
}
