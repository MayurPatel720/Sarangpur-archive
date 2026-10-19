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
import { deptLabel, DEPARTMENTS, ALWAYS_VISIBLE, type ColumnSpec, type CustomColumn, type DeptId } from '@/lib/item-columns';
import { isoDayToDmy, parseDateRange } from '@/lib/date-range';
import { mediaTypeText } from '@/lib/item-cells';
import { MAX_RECHECK_WEEKS, weeksText } from '@/lib/recheck';
import { refLabel, refOptions, type RefLists } from '@/lib/ref-lists';
import { photoMediumUrl } from '@/lib/project-photos';
import type { GridItem, ItemsBulkSet } from '@/types/items';
import { DeptHeader, GridHeader, type DeptHeaderParams, type GridHeaderParams } from './GridHeader';

/**
 * One AG Grid = one sheet of the lot's Excel (one media type). Columns come from
 * src/lib/item-columns.ts, grouped under their department. ItemsGrid owns filters, the
 * hidden-column list, saving and the dialogs, and passes them in.
 */

type Spec = ColumnSpec & { custom?: CustomColumn };

/** Row height of a sheet with a photo column (a normal row is 42px: this is about four of them). */
export const PHOTO_ROW_PX = 168;
type Tri = boolean | null;
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
  refLists,
  onOpenPhotos,
  onViewPhotos,
  height,
  onOpenCode,
  onDuplicate,
  onHide,
  onDeleteColumn,
  onShowOnly,
  onHideDept,
  onlyDept,
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
  /** Every admin-managed list the dropdown columns read (Guru, Category, …). */
  refLists: RefLists;
  /** Open the item's photos to add / delete (Prasadi). */
  onOpenPhotos: (item: GridItem) => void;
  /** View the item's photos full screen. */
  onViewPhotos: (item: GridItem) => void;
  /** CSS height of the grid box. */
  height: string;
  onOpenCode: (item: GridItem) => void;
  onDuplicate: (item: GridItem, otherCode: string) => void;
  onHide: (columnId: string) => void;
  /** Show only one department (null = all). A view for this user, not saved. */
  onShowOnly: (dept: DeptId | null) => void;
  onHideDept: (dept: DeptId) => void;
  onlyDept: DeptId | null;
  onDeleteColumn: (column: CustomColumn) => void;
  onInvalid: (message: string) => void;
  onSave: (itemIds: string[], set: ItemsBulkSet) => void;
  onReorder: (lineIndex: number, orderedIds: string[]) => void;
  onSelectionChange: (sheet: number, ids: string[]) => void;
  onApi: (sheet: number, api: GridApi<GridItem> | null) => void;
}) {
  // A sheet that shows photos gets rows about four times as tall, so the picture is big enough to see.
  const hasPhotoColumn = columns.some((c) => c.kind === 'photo');
  // The row height goes into the theme (not the rowHeight prop) so the grid also sizes the text line to it —
  // that is what keeps every cell's text centred up and down in the taller rows.
  const gridTheme = useMemo(() => (hasPhotoColumn ? agGridTheme.withParams({ rowHeight: PHOTO_ROW_PX }) : agGridTheme), [hasPhotoColumn]);
  const specById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const columnDefs = useMemo<(ColDef<GridItem> | ColGroupDef<GridItem>)[]>(() => {
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

      // Format-specific columns (registry `attr`): kept in the row's `attrs` map.
      if (spec.attr) {
        const key = spec.id;
        const setAttr = (d: GridItem, value: unknown) => {
          const next: Record<string, unknown> = { ...d.attrs, [key]: value };
          // A dependent dropdown: changing Category clears the Subcategory that belonged to the old one.
          if (d.attrs[key] !== value) for (const r of spec.resets ?? []) next[r] = null;
          d.attrs = next as GridItem['attrs'];
        };
        if (spec.kind === 'flag') {
          return {
            ...base,
            editable: canDetails,
            valueGetter: (p) => (p.data ? (p.data.attrs[key] === true ? 'Yes' : 'No') : ''),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              setAttr(p.data, p.newValue === 'Yes');
              return true;
            },
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['Yes', 'No'] },
          };
        }
        if (spec.kind === 'ref') {
          const parent = spec.refParent?.column;
          return {
            ...base,
            editable: canDetails && (parent ? true : true),
            cellEditor: 'agSelectCellEditor',
            // The options follow the row: Subcategory offers only the chosen Category's.
            cellEditorParams: (p: { data?: GridItem }) => ({
              values: ['', ...refOptions(spec, refLists, parent ? p.data?.attrs[parent] : undefined).map((o) => o.value)],
            }),
            valueGetter: (p) => (p.data ? String(p.data.attrs[key] ?? '') : ''),
            valueFormatter: (p) => refLabel(refLists, spec.refList ?? '', p.value as string | null),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              const text = String(p.newValue ?? '').trim();
              setAttr(p.data, text === '' ? null : text);
              return true;
            },
          };
        }
        if (spec.kind === 'number') {
          return {
            ...base,
            editable: canDetails,
            cellEditor: 'agNumberCellEditor',
            cellEditorParams: { min: 0, precision: 0 },
            valueGetter: (p) => (p.data && typeof p.data.attrs[key] === 'number' ? (p.data.attrs[key] as number) : null),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              const raw = String(p.newValue ?? '').trim();
              const n = raw === '' ? null : Number(raw);
              if (n !== null && (!Number.isInteger(n) || n < 0)) {
                onInvalid(`${spec.label} must be a whole number.`);
                return false;
              }
              setAttr(p.data, n);
              return true;
            },
          };
        }
        const isDate = spec.kind === 'date' || spec.kind === 'dateRange';
        return {
          ...base,
          editable: canDetails,
          cellEditor: spec.kind === 'longtext' ? 'agLargeTextCellEditor' : 'agTextCellEditor',
          valueGetter: (p) => (p.data ? String(p.data.attrs[key] ?? '') : ''),
          valueSetter: (p: ValueSetterParams<GridItem>) => {
            if (!p.data) return false;
            const text = String(p.newValue ?? '').trim();
            if (isDate && text && !parseDateRange(text).ok) {
              onInvalid('Use dd/mm/yyyy, a range, or just a year.');
              return false;
            }
            setAttr(p.data, text === '' ? null : text);
            return true;
          },
        };
      }

      switch (spec.kind) {
        case 'photo':
          return {
            ...base,
            editable: false,
            sortable: false,
            cellClass: 'cursor-pointer !p-1',
            tooltipValueGetter: (p) => (p.data?.coverUrl ? 'Click to see the photos full screen' : 'Click to add photos'),
            // Click the picture → full screen. Click "Manage" (or an empty cell) → add / delete photos.
            onCellClicked: (p) => {
              if (!p.data) return;
              const manage = (p.event?.target as HTMLElement | null)?.closest('[data-manage]');
              if (manage || !p.data.coverUrl) onOpenPhotos(p.data);
              else onViewPhotos(p.data);
            },
            valueGetter: (p) => p.data?.imageCount ?? 0,
            cellRenderer: (p: ICellRendererParams<GridItem>) =>
              p.data?.coverUrl ? (
                <span className="relative block h-full w-full overflow-hidden rounded-[6px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoMediumUrl(p.data.coverUrl)} alt="" className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded-[4px] bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {p.data.imageCount} {p.data.imageCount === 1 ? 'photo' : 'photos'}
                  </span>
                  <span data-manage className="absolute right-1 top-1 rounded-[4px] bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-accent shadow-control">
                    Manage
                  </span>
                </span>
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-[6px] border border-dashed border-line-strong text-[12px] font-medium text-accent">
                  + Add photo
                </span>
              ),
          };
        case 'weeks':
          // Only a number is typed; "weeks" is always written beside it.
          return {
            ...base,
            editable: canDetails,
            valueGetter: (p) => p.data?.recheckWeeks ?? null,
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              const raw = String(p.newValue ?? '').trim();
              const n = raw === '' ? null : Number(raw);
              if (n !== null && (!Number.isInteger(n) || n < 1 || n > MAX_RECHECK_WEEKS)) {
                onInvalid(`Use a whole number of weeks (1–${MAX_RECHECK_WEEKS}).`);
                return false;
              }
              p.data.recheckWeeks = n;
              return true;
            },
            cellEditor: 'agNumberCellEditor',
            cellEditorParams: { min: 1, max: MAX_RECHECK_WEEKS, precision: 0 },
            cellRenderer: (p: ICellRendererParams<GridItem>) =>
              p.value ? <span>{weeksText(p.value as number)}</span> : <span className="text-ink-4">__ weeks</span>,
          };
        case 'info':
          return {
            ...base,
            editable: false,
            cellClass: 'text-ink-3',
            valueGetter: (p) => (p.data ? String((p.data as unknown as Record<string, unknown>)[spec.id] ?? '') : ''),
          };
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
            valueGetter: (p) => (p.data ? (p.data[f] ? 'Yes' : 'No') : ''),
            valueSetter: (p: ValueSetterParams<GridItem>) => {
              if (!p.data) return false;
              p.data[f] = p.newValue === 'Yes';
              return true;
            },
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: { values: ['Yes', 'No'] },
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
      headerGroupComponent: DeptHeader,
      headerGroupComponentParams: {
        active: onlyDept === d.id,
        onShowOnly: () => onShowOnly(d.id),
        onShowAll: () => onShowOnly(null),
        onHideAll: () => onHideDept(d.id),
      } satisfies Partial<DeptHeaderParams>,
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
  }, [columns, canDetails, canDecide, canReorder, refLists, onOpenPhotos, onViewPhotos, onOpenCode, onDuplicate, onHide, onDeleteColumn, onShowOnly, onHideDept, onlyDept, onInvalid]);

  const onCellValueChanged = (e: CellValueChangedEvent<GridItem>) => {
    if (!e.data) return;
    const spec = specById.get(e.column.getColId());
    if (!spec) return;
    const id = e.data.id;
    if (spec.custom) {
      onSave([id], { custom: { [spec.custom.key]: e.data.custom[spec.custom.key] ?? null } });
      return;
    }
    if (spec.attr) {
      const v = e.data.attrs[spec.id];
      const patch: Record<string, string | number | boolean | null> = { [spec.id]: spec.kind === 'flag' ? v === true : (v ?? null) };
      // Changing a dropdown also saves what it cleared (Category → Subcategory).
      for (const r of spec.resets ?? []) patch[r] = e.data.attrs[r] ?? null;
      onSave([id], { attrs: patch });
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
        theme={gridTheme}
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
