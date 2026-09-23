'use client';

import { IconChevronLeft, IconChevronRight } from './icons';

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function totalPagesOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Window of page numbers with ellipsis markers: 1, '…', 4, 5, 6, '…', 20 */
export function pageItems(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (page >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

function pageBtn(active: boolean, disabled: boolean) {
  return `inline-flex h-8 min-w-8 items-center justify-center rounded-full border-0 px-1.5 text-[12.5px] font-semibold cursor-pointer transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${
    active
      ? 'bg-accent-soft text-accent'
      : 'bg-transparent text-ink-3 hover:bg-surface-sunken hover:text-ink active:bg-line-soft'
  }`;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  label = 'results',
  showPageSize = true,
  className = '',
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  label?: string;
  showPageSize?: boolean;
  className?: string;
}) {
  if (total <= 0) return null;
  const single = totalPages <= 1 && !showPageSize;
  if (single) {
    return (
      <div className={`flex items-center gap-3 border-t border-line-soft px-3 md:px-4 py-3 text-[12.5px] text-ink-3 ${className}`}>
        {total} {label}
      </div>
    );
  }

  const items = pageItems(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center gap-3 border-t border-line-soft px-3 md:px-4 py-3 ${className}`}
    >
      <p
        className="m-0 text-[12.5px] text-ink-3"
        aria-live="polite"
      >
        Page {page} of {totalPages} · {total} {label}
      </p>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {showPageSize && onPageSizeChange ? (
          <label className="mr-2 flex items-center gap-1.5 text-[12px] text-ink-3">
            <span className="whitespace-nowrap">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-[6px] border border-line bg-surface px-2 text-[12.5px] text-ink-2 cursor-pointer"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          className={pageBtn(false, page <= 1)}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <IconChevronLeft size={14} />
        </button>

        {items.map((item, i) =>
          item === '…' ? (
            <span key={`e-${i}`} className="px-1 text-[12px] text-ink-4" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={pageBtn(item === page, false)}
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          className={pageBtn(false, page >= totalPages)}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <IconChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
