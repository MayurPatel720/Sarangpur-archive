'use client';

import { useEffect, useRef, useState } from 'react';
import { DEPARTMENTS, type ColumnSpec } from '@/lib/item-columns';

/**
 * "⋯" at the top right of the Excel: lists the hidden columns by department so they can be
 * brought back one at a time (or all at once). Hiding itself is done from a column header.
 */
export function HiddenColumnsMenu({
  hidden,
  onShow,
  onShowAll,
}: {
  hidden: ColumnSpec[];
  onShow: (columnId: string) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={hidden.length ? `Hidden columns (${hidden.length})` : 'Hidden columns'}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Hidden columns"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-2 cursor-pointer hover:bg-accent-soft"
      >
        <span aria-hidden className="text-[16px] leading-none tracking-[1px]">
          ⋯
        </span>
        {hidden.length > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-strong">
            {hidden.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 max-h-[60dvh] w-[260px] overflow-y-auto rounded-[8px] border border-line bg-surface py-1.5 shadow-panel"
        >
          {hidden.length === 0 ? (
            <p className="m-0 px-3 py-2 text-[12.5px] text-ink-3">No hidden columns. Click a column name to hide it.</p>
          ) : (
            <>
              <div className="flex items-center px-3 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">Hidden columns</span>
                <button
                  type="button"
                  onClick={() => {
                    onShowAll();
                    setOpen(false);
                  }}
                  className="ml-auto border-0 bg-transparent p-0 text-[12px] text-accent cursor-pointer"
                >
                  Show all
                </button>
              </div>
              {DEPARTMENTS.map((d) => {
                const cols = hidden.filter((c) => c.dept === d.id);
                if (cols.length === 0) return null;
                return (
                  <div key={d.id} className="py-1">
                    <div className="px-3 py-0.5 text-[11.5px] font-semibold text-ink-3">{d.label}</div>
                    {cols.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="menuitem"
                        onClick={() => onShow(c.id)}
                        className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-[12.5px] text-ink cursor-pointer hover:bg-accent-soft"
                      >
                        <span aria-hidden className="text-ink-4">
                          ＋
                        </span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
