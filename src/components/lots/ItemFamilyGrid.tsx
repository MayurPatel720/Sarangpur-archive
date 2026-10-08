'use client';

import { useMemo } from 'react';
import type {
  CellValueChangedEvent,
  ColDef,
  ColGroupDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  RowDragEndEvent,
  SelectionChangedEvent,
  ValueSetterParams,
} from 'ag-grid-community';
import { AgGridReact, agGridTheme } from '@/components/ui/AgGridShell';
import { deptLabel, DEPARTMENTS, ALWAYS_VISIBLE, type ColumnSpec, type CustomColumn } from '@/lib/item-columns';
import { isoDayToDmy, parseDateRange } from '@/lib/date-range';
import { mediaTypeText } from '@/lib/item-cells';
import type { GridItem, ItemsBulkSet } from '@/types/items';
import { GridHeader, type GridHeaderParams } from './GridHeader';

/**
 * One AG Grid = one sheet of the lot's Excel (one media type). Columns come from
 * src/lib/item-columns.ts, grouped under their department. ItemsGrid owns filters, the
 * hidden-column list, saving and the dialogs, and passes them in.
 */

type Spec = ColumnSpec & { custom?: CustomColumn };
type Tri = boolean | null;
type Opt = { value: string; label: string };
const TRI_VALUES = ['Yes', 'No', ''] as const;
const triText = (v: Tri) => (v === true ? 'Yes' : v === false ? 'No' : '');
const triParse = (s: unknown): Tri => (s === 'Yes' ? true : s === 'No' ? false : null);

export function ItemFamilyGrid({
  lineIndex,
  rows,
  columns,
  canDetails,
  canDecide,
  canReorder,
  physical,
  height,
  onOpenCode,
  onDuplicate,
  onHide,
  onDeleteColumn,
  onInvalid,
  onSave,
  onReorder,
  onSelectionChange,
  onApi,
}: {
  lineIndex: number;
  rows: GridItem[];
  /** Visible columns only, in department order. */
  columns: Spec[];
  canDetails: boolean;
  canDecide: boolean;
  canReorder: boolean;
  physical: Opt[];
  /** CSS height of the grid box. */
  height: string;
  onOpenCode: (item: GridItem) => void;
  onDuplicate: (item: GridItem, otherCode: string) => void;
  onHide: (columnId: string) => void;
  onDeleteColumn: (column: CustomColumn) => void;
  onInvalid: (message: string) => void;
  onSave: (itemIds: string[], set: ItemsBulkSet) => void;
  onReorder: (lineIndex: number, orderedIds: string[]) => void;
  onSelectionChange: (sheet: number, ids: string[]) => void;
  onApi: (sheet: number, api: GridApi<GridItem> | null) => void;
}) {
  const specById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const columnDefs = useMemo<(ColDef<GridItem> | ColGroupDef<GridItem>)[]>(() => {
    const refLabel = (list: Opt[], v: string | null) => (v ? (list.find((i) => i.value === v)?.label ?? v) : '');

    const header = (spec: Spec): Partial<ColDef<GridItem>> => ({
      headerName: spec.label,
      headerComponent: GridHeader,
      headerComponentParams: {
        hideable: !ALWAYS_VISIBLE.has(spec.id),
        onHide: () => onHide(spec.id),
        ...(spec.custom ? { onDelete: () => onDeleteColumn(spec.custom!) } : {}),
        hint: spec.hint,
      } satisfies Partial<GridHeaderParams>,
    });

    const triGetterSetter = (get: (d: GridItem) => Tri, set: (d: GridItem, v: Tri) => void): Partial<ColDef<GridItem>> => ({
      valueGetter: (p) => (p.data ? triText(get(p.data)) : ''),
      valueSetter: (p: ValueSetterParams<GridItem>) => {
        if (!p.data) return false;
        set(p.data, triParse(p.newValue));
        return true;
      },
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: [...TRI_VALUES] },
    });

    const build = (spec: Spec): ColDef<GridItem> => {
      const base: ColDef<GridItem> = { colId: spec.id, width: spec.width, ...header(spec) };
      const textEdit = (): ColDef<GridItem> => ({
        ...base,
        field: (spec.field ?? spec.id) as keyof GridItem & string,
        editable: canDetails,
        cellEditor: 'agTextCellEditor',
      });

      if (spec.custom) {
        const key = spec.custom.key;
        const type = spec.custom.type;
        const read = (d: GridItem) => d.custom[key] ?? null;
        if (type === 'yesno') {
          return {
            ...base,
            editable: canDetails,
            ...triGetterSetter(
              (d) => (typeof read(d) === 'boolean' ? (read(d) as boolean) : null),
              (d, v) => {
                d.custom = { ...d.custom, [key]: v };
              },
            ),
          };
        }
        return {
          ...base,
          editable: canDetails,
          cellEditor: 'agTextCellEditor',
          valueGetter: (p) => {
            const v = p.data ? read(p.data) : null;
            if (v === null || v === undefined) return '';
            return type === 'date' ? isoDayToDmy(String(v)) : String(v);
          },
          valueSetter: (p: ValueSetterParams<GridItem>) => {
            if (!p.data) return false;
            const text = String(p.newValue ?? '').trim();
            if (type === 'date' && text && !parseDateRange(text).ok) {
              onInvalid('Use dd/mm/yyyy.');
              return false;
            }
            if (type === 'number' && text && !Number.isFinite(Number(text))) {
              onInvalid('Must be a number.');
              return false;
            }
            p.data.custom = { ...p.data.custom, [key]: text === '' ? null : type === 'number' ? Number(text) : text };
            return true;
          },
        };
      }

      switch (spec.kind) {
        case 'readonly':
          return { ...base, valueGetter: (p) => (p.data ? mediaTypeText(p.data) : '') };
        case 'code':
          return {
            ...base,
            field: 'code',
            pinned: 'left',
            cellClass: 'font-mono',
            tooltipValueGetter: () => 'Click to change the code',
            onCellClicked: (p) => p.data && onOpenCode(p.data),
            cellRenderer: (p: ICellRendererParams<GridItem>) => (
              <button type="button" className="bg-transparent border-0 p-0 text-accent cursor-pointer font-mono text-[12.5px]">
                {p.value as string}
              </button>
            ),
          };
        case 'dateRange':
        case 'date':
          return {
            ...textEdit(),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              const text = String(p.newValue ?? '').trim();
              if (text && !parseDateRange(text).ok) {
                onInvalid('Use dd/mm/yyyy or dd/mm/yyyy - dd/mm/yyyy.');
                return false;
              }
              (p.data as Record<string, unknown>)[spec.field!] = text;
              return true;
            },
          };
        case 'ref':
          return {
            ...textEdit(),
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['', ...physical.map((i) => i.value)] },
            valueFormatter: (p) => refLabel(physical, p.value as string | null),
            refData: Object.fromEntries(physical.map((i) => [i.value, i.label])),
          };
        case 'yesno': {
          const f = spec.field as 'digital' | 'redigital' | 'discard';
          return {
            ...base,
            editable: canDecide,
            ...triGetterSetter(
              (d) => d[f],
              (d, v) => {
                d[f] = v;
              },
            ),
          };
        }
        case 'flag': {
          const f = spec.field as 'captured' | 'taggedInMls' | 'logged';
          return {
            ...base,
            editable: canDetails,
            valueGetter: (p) => (p.data?.[f] ? 'Yes' : ''),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              p.data[f] = p.newValue === 'Yes';
              return true;
            },
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['Yes', ''] },
          };
        }
        case 'disposition':
          return {
            ...base,
            editable: (p) => canDetails && p.data?.dispositionStatus !== 'done',
            valueGetter: (p) => (p.data?.disposition === 'return' ? 'Return' : p.data?.disposition === 'discard' ? 'Discard' : ''),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              p.data.disposition = p.newValue === 'Return' ? 'return' : p.newValue === 'Discard' ? 'discard' : null;
              return true;
            },
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['', 'Return', 'Discard'] },
          };
        case 'duplicate':
          return {
            ...base,
            cellClass: 'font-mono',
            editable: (p) => canDetails && !p.data?.duplicateCode,
            cellEditor: 'agTextCellEditor',
            valueGetter: (p) =>
              p.data?.duplicateCode
                ? p.data.duplicateCode
                : p.data?.duplicatedBy.length
                  ? `Duplicated by ${p.data.duplicatedBy.join(', ')}`
                  : '',
            // Typing a code never edits the cell — it opens the "which is the main one?" dialog.
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              const text = String(p.newValue ?? '').trim();
              if (p.data && text) onDuplicate(p.data, text);
              return false;
            },
          };
        default:
          return textEdit();
      }
    };

    // The Archive code is pinned, so it sits outside the department bands (AG Grid would
    // otherwise split "Details" into two bands at the pin boundary).
    const codeCol = columns.find((c) => c.kind === 'code');
    const groups: ColGroupDef<GridItem>[] = DEPARTMENTS.map((d) => ({
      headerName: deptLabel(d.id),
      children: columns.filter((c) => c.dept === d.id && c.kind !== 'code').map(build),
    })).filter((g) => g.children.length > 0);

    return [
      {
        colId: 'rowNo',
        headerName: '#',
        width: 78,
        pinned: 'left',
        suppressMovable: true,
        sortable: false,
        resizable: false,
        rowDrag: canReorder,
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
        cellClass: 'text-ink-4 text-[12px]',
        headerClass: 'text-ink-4',
      },
      ...(codeCol ? [build(codeCol)] : []),
      ...groups,
    ];
  }, [columns, canDetails, canDecide, canReorder, physical, onOpenCode, onDuplicate, onHide, onDeleteColumn, onInvalid]);

  const onCellValueChanged = (e: CellValueChangedEvent<GridItem>) => {
    if (!e.data) return;
    const spec = specById.get(e.column.getColId());
    if (!spec) return;
    const id = e.data.id;
    if (spec.custom) {
      onSave([id], { custom: { [spec.custom.key]: e.data.custom[spec.custom.key] ?? null } });
      return;
    }
    const field = spec.field as keyof ItemsBulkSet | undefined;
    if (!field) return;
    let value: unknown = (e.data as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.trim() === '') value = null;
    onSave([id], { [field]: value } as ItemsBulkSet);
  };

  const onRowDragEnd = (e: RowDragEndEvent<GridItem>) => {
    const ids: string[] = [];
    e.api.forEachNode((n) => {
      if (n.data) ids.push(n.data.id);
    });
    onReorder(lineIndex, ids);
  };

  return (
    <div className="w-full min-h-[160px]" style={{ height }}>
      <AgGridReact<GridItem>
        theme={agGridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: false, suppressMovable: true, resizable: true }}
        getRowId={(p) => p.data.id}
        rowSelection={canDetails ? { mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false } : undefined}
        selectionColumnDef={{ pinned: 'left', width: 44 }}
        rowDragManaged={canReorder}
        animateRows={canReorder}
        onRowDragEnd={onRowDragEnd}
        onGridReady={(e: GridReadyEvent<GridItem>) => onApi(lineIndex, e.api)}
        onGridPreDestroyed={() => {
          onApi(lineIndex, null);
          onSelectionChange(lineIndex, []);
        }}
        onSelectionChanged={(e: SelectionChangedEvent<GridItem>) =>
          onSelectionChange(lineIndex, e.api.getSelectedRows().map((r) => r.id))
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
