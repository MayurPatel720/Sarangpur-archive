'use client';

import { useState } from 'react';

/**
 * The Master Excel's Columns panel: one list, grouped by department. Each department has a tick box that shows / hides all its
 * columns, a count (shown / total) and folds away. Columns the lots added to their own Excel sit inside the department their lots
 * put them in, tagged "lots"; ticking one adds it to the sheet. A search box narrows the list, which opens every department.
 */
export interface PanelColumn {
  id: string;
  label: string;
  group: string;
  checked: boolean;
  /** Small tag after the name, e.g. "5 lots". */
  tag?: string;
}

export function MasterColumnsPanel({
  columns,
  groups,
  onToggle,
  onToggleGroup,
  onShowAll,
  onHideAll,
  onReset,
  onAdd,
}: {
  columns: PanelColumn[];
  /** Departments in sheet order. */
  groups: { id: string; label: string }[];
  onToggle: (id: string, on: boolean) => void;
  onToggleGroup: (group: string, on: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onReset: () => void;
  onAdd: () => void;
}) {
  const [q, setQ] = useState('');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const t = q.trim().toLowerCase();
  const total = columns.filter((c) => c.checked).length;
  return (
    <div className="flex max-h-[min(72vh,560px)] flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 pb-2 pt-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          name="columnSearch"
          autoComplete="off"
          placeholder="Find a column…"
          aria-label="Find a column"
          onKeyDown={(e) => e.stopPropagation()}
          className="h-8 w-full rounded-[6px] border border-line-strong bg-surface px-2 text-[12.5px] text-ink placeholder:text-ink-4"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span className="tabular-nums text-ink-3">
            {total} of {columns.length} shown
          </span>
          <button type="button" className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={onHideAll}>
            Hide all
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {groups.map((g) => {
          const all = columns.filter((c) => c.group === g.id);
          const list = t ? all.filter((c) => c.label.toLowerCase().includes(t)) : all;
          if (list.length === 0) return null;
          const on = all.filter((c) => c.checked).length;
          const open = t !== '' || !folded.has(g.id);
          return (
            <section key={g.id} aria-label={g.label} className="px-1">
              <div className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-surface-sunken">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                  checked={on === all.length}
                  ref={(el) => {
                    if (el) el.indeterminate = on > 0 && on < all.length;
                  }}
                  onChange={(e) => onToggleGroup(g.id, e.target.checked)}
                  aria-label={`Show every ${g.label} column`}
                />
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setFolded((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      return next;
                    })
                  }
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[12.5px] font-semibold text-ink"
                >
                  <span className="truncate">{g.label}</span>
                  <span className="ml-auto text-[11.5px] font-medium tabular-nums text-ink-3">
                    {on}/{all.length}
                  </span>
                  <span aria-hidden className="text-[10px] text-ink-4">
                    {open ? '▾' : '▸'}
                  </span>
                </button>
              </div>
              {open ? (
                <ul className="m-0 list-none p-0 pb-1 pl-6">
                  {list.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1 text-[12.5px] text-ink hover:bg-surface-sunken">
                        <input type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-accent" checked={c.checked} onChange={(e) => onToggle(c.id, e.target.checked)} />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        {c.tag ? <span className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold text-accent">{c.tag}</span> : null}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
        {t && !columns.some((c) => c.label.toLowerCase().includes(t)) ? <p className="m-0 px-3 py-2 text-[12.5px] text-ink-3">No column matches.</p> : null}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-3 pt-2 text-[12px]">
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={onAdd}>
          + Add a column
        </button>
        <button type="button" className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-ink-3 hover:text-ink" onClick={onReset}>
          Reset columns
        </button>
      </div>
    </div>
  );
}
