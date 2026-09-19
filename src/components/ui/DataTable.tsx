import type { KeyboardEvent, ReactNode } from 'react';
import { Skeleton } from './primitives';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

/**
 * Responsive data table. Renders a real `<table>` on md+ screens and falls
 * back to stacked cards on small screens, both driven by the same columns.
 */
export function DataTable<T>({
  columns,
  rows,
  loading,
  emptyMessage,
  getRowKey,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading: boolean;
  emptyMessage: string;
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-label="Loading rows">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="m-0 text-[13px] font-medium text-ink-3">{emptyMessage}</p>
      </div>
    );
  }

  const handleKey = (row: T) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <>
      {/* Desktop: real table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-soft">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap ${c.className ?? ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? handleKey(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`border-b border-line-soft last:border-b-0 ${onRowClick ? 'cursor-pointer hover:bg-accent-soft/40 focus-visible:outline-2 focus-visible:outline-accent' : ''}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 text-[13px] text-ink-2 align-top ${c.className ?? ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? handleKey(row) : undefined}
            className="bg-surface border border-line rounded-[8px] px-3.5 py-3 flex flex-col gap-1.5 cursor-pointer"
          >
            {columns.map((c) => (
              <div key={c.key} className="flex items-baseline gap-2 min-w-0">
                <span className="flex-shrink-0 w-[92px] text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  {c.header}
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-ink-2">{c.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
