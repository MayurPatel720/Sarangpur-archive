'use client';

import { useState, type ReactNode } from 'react';
import { Field, GhostButton } from './Form';
import { IconButton } from './IconButton';
import { IconCopy, IconPlus } from './icons';

/** Everything a cell render needs to know about its row. */
export type EditableCellCtx<T> = {
  row: T;
  rowId: string;
  index: number;
  /** Human label for the row, from `rowName` — use in aria-labels. */
  rowLabel: string;
  /** Error for this cell, if any (keyed `${rowId}.${columnKey}`). */
  error?: string;
  /** True for the first column of a freshly added/duplicated row. */
  autoFocus: boolean;
  /** True inside the mobile card render. */
  mobile: boolean;
};

export type EditableColumn<T> = {
  key: string;
  header: string;
  render: (ctx: EditableCellCtx<T>) => ReactNode;
  className?: string;
  /** Marks the header as a required cell (asterisk + sr-only text). */
  required?: boolean;
};

/**
 * Focus the first focusable control inside the cell with this key
 * (`${rowId}.${columnKey}`), skipping the hidden responsive twin
 * (desktop table vs mobile cards). Returns whether anything took focus.
 */
export function focusEditableCell(key: string): boolean {
  if (typeof document === 'undefined') return false;
  const cells = document.querySelectorAll<HTMLElement>('[data-cell]');
  for (const cell of Array.from(cells)) {
    if (cell.dataset.cell !== key) continue;
    if (cell.offsetParent === null) continue; // hidden breakpoint twin
    const target = cell.matches('input,select,textarea,button')
      ? cell
      : cell.querySelector<HTMLElement>('input,select,textarea,button');
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
}

type Props<T> = {
  columns: EditableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onChange: (rows: T[]) => void;
  /** Cell errors keyed `${rowId}.${columnKey}`. */
  errors?: Partial<Record<string, string>>;
  createRow?: () => T;
  cloneRow?: (row: T) => T;
  minRows?: number;
  maxRows?: number;
  addLabel?: string;
  rowName?: (index: number) => string;
  /** Tooltip when delete is disabled at minRows. */
  minRowsHint?: string;
  emptyMessage?: string;
  /** Off = no delete buttons (retire-in-place lists). */
  allowDelete?: boolean;
  /** Extra content under the add-row button (totals, total error…). */
  footer?: ReactNode;
};

export function EditableTable<T>({
  columns,
  rows,
  getRowId,
  onChange,
  errors,
  createRow,
  cloneRow,
  minRows = 0,
  maxRows = Number.POSITIVE_INFINITY,
  addLabel = 'Add row',
  rowName = (i) => `Row ${i + 1}`,
  minRowsHint,
  emptyMessage,
  allowDelete = true,
  footer,
}: Props<T>) {
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const showActions = allowDelete || Boolean(cloneRow);
  const canAdd = Boolean(createRow) && rows.length < maxRows;

  const handleAdd = () => {
    if (!createRow || rows.length >= maxRows) return;
    const row = createRow();
    setFocusRowId(getRowId(row));
    onChange([...rows, row]);
  };

  const handleDuplicate = (index: number) => {
    if (!cloneRow || rows.length >= maxRows) return;
    const row = cloneRow(rows[index]!);
    setFocusRowId(getRowId(row));
    const next = [...rows];
    next.splice(index + 1, 0, row);
    onChange(next);
  };

  const handleRemove = (index: number) => {
    if (rows.length <= minRows) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  const cellError = (rowId: string, key: string) => errors?.[`${rowId}.${key}`];
  const firstKey = columns[0]?.key;

  const renderRow = (row: T, index: number, mobile: boolean): ReactNode => {
    const rowId = getRowId(row);
    const label = rowName(index);
    const atMin = rows.length <= minRows;
    const atMax = rows.length >= maxRows;

    const actions = showActions ? (
      <span className="inline-flex items-center gap-1">
        {cloneRow ? (
          <IconButton
            label={`Duplicate ${label}`}
            disabled={atMax}
            onClick={() => handleDuplicate(index)}
          >
            <IconCopy size={15} />
          </IconButton>
        ) : null}
        {allowDelete ? (
          <IconButton
            label={atMin && minRowsHint ? minRowsHint : `Remove ${label}`}
            variant="danger"
            icon="trash"
            disabled={atMin}
            onClick={() => handleRemove(index)}
          />
        ) : null}
      </span>
    ) : null;

    if (mobile) {
      return (
        <div key={rowId} className="border border-line-soft rounded-[6px] p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
              {label}
            </h3>
            {actions}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {columns.map((col) => {
              const key = `${rowId}.${col.key}`;
              const error = cellError(rowId, col.key);
              const ctx: EditableCellCtx<T> = {
                row,
                rowId,
                index,
                rowLabel: label,
                error,
                autoFocus: rowId === focusRowId && col.key === firstKey,
                mobile: true,
              };
              return (
                <Field key={col.key} label={col.header} required={col.required} error={error}>
                  <div data-cell={key} className="min-w-0">
                    {col.render(ctx)}
                  </div>
                </Field>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <tr key={rowId}>
        <td className="px-3 py-2 text-[12px] text-ink-3 tabular-nums align-top">{index + 1}</td>
        {columns.map((col) => {
          const key = `${rowId}.${col.key}`;
          const error = cellError(rowId, col.key);
          const ctx: EditableCellCtx<T> = {
            row,
            rowId,
            index,
            rowLabel: label,
            error,
            autoFocus: rowId === focusRowId && col.key === firstKey,
            mobile: false,
          };
          return (
            <td
              key={col.key}
              data-cell={key}
              className={`px-2 py-2 align-top text-[13px] text-ink-2 ${col.className ?? ''}`}
            >
              {col.render(ctx)}
              {error ? (
                <span role="alert" className="block mt-1 text-[11.5px] font-medium text-danger">
                  {error}
                </span>
              ) : null}
            </td>
          );
        })}
        {showActions ? (
          <td className="px-3 py-2 align-top whitespace-nowrap text-right">{actions}</td>
        ) : null}
      </tr>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <div className="hidden md:block overflow-x-auto border border-line-soft rounded-[6px]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft">
                <th
                  scope="col"
                  className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3"
                >
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap ${col.className ?? ''}`}
                  >
                    {col.header}
                    {col.required ? (
                      <>
                        <span aria-hidden="true" className="text-danger">
                          {' '}
                          *
                        </span>
                        <span className="sr-only"> (required)</span>
                      </>
                    ) : null}
                  </th>
                ))}
                {showActions ? (
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3 text-right"
                  >
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>{rows.map((row, i) => renderRow(row, i, false))}</tbody>
          </table>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="md:hidden flex flex-col gap-3">
          {rows.map((row, i) => renderRow(row, i, true))}
        </div>
      ) : null}

      {rows.length === 0 && emptyMessage ? (
        <p className="m-0 px-4 py-6 text-center text-[13px] text-ink-3 border border-dashed border-line-soft rounded-[6px]">
          {emptyMessage}
        </p>
      ) : null}

      <div className="flex items-center gap-3 flex-wrap">
        {canAdd ? (
          <GhostButton onClick={handleAdd}>
            <span className="inline-flex items-center gap-1.5">
              <IconPlus size={15} />
              {addLabel}
            </span>
          </GhostButton>
        ) : null}
        {Number.isFinite(maxRows) && maxRows > 1 ? (
          <span className="text-[12.5px] text-ink-2 tabular-nums">
            {rows.length} of {maxRows} rows
          </span>
        ) : null}
      </div>

      {footer}
    </div>
  );
}
