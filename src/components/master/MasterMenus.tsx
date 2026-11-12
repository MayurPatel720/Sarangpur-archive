'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEPARTMENTS, deptLabel, type ColumnSpec } from '@/lib/item-columns';
import { DEFAULT_VIEW, type Density, type MasterView, type SavedView } from '@/components/master/master-view';

/** Small menus for the Master Excel's toolbar and column headers. */

const btn =
  'inline-flex h-9 touch-manipulation cursor-pointer sm:h-8 items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2.5 text-[12.5px] font-semibold text-ink-2 shadow-control transition-colors hover:bg-accent-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50';
export const toolbarButton = btn;

export const menuItem =
  'flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-[12.5px] text-ink-2 hover:bg-accent-soft hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

/** A button that opens a floating panel (fixed, so a scrolling table never clips it). */
export function Menu({
  trigger,
  label,
  width = 260,
  align = 'left',
  className = btn,
  children,
}: {
  trigger: ReactNode;
  label: string;
  width?: number;
  align?: 'left' | 'right';
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (panel.current?.contains(e.target as Node) || ref.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    const shut = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
        onClick={() => {
          const r = ref.current?.getBoundingClientRect();
          if (r) {
            const left = align === 'right' ? r.right - width : r.left;
            setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) });
          }
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={panel}
          role="menu"
          style={{ top: pos.top, left: pos.left, width }}
          className="fixed z-[120] max-h-[70dvh] overflow-y-auto overscroll-contain rounded-[8px] border border-line bg-surface py-1.5 shadow-panel"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </>
  );
}

const Heading = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">{children}</div>
);

/* --------------------------------------------------------------- columns picker */

export function ColumnsMenu({
  columns,
  view,
  setView,
  depts,
  shownDepts,
  onToggleDept,
}: {
  columns: ColumnSpec[];
  view: MasterView;
  setView: (patch: Partial<MasterView>) => void;
  depts: { id: string; label: string }[];
  shownDepts: string[];
  onToggleDept: (id: string, on: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const hiddenCount = view.hidden.filter((id) => columns.some((c) => c.id === id)).length;
  const match = (c: ColumnSpec) => c.label.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <Menu
      label="Choose columns"
      width={300}
      trigger={
        <>
          Columns
          {hiddenCount > 0 ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-white">{hiddenCount} hidden</span> : null}
        </>
      }
    >
      {() => (
        <>
          <div className="px-3 pb-2 pt-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              name="columnSearch"
              autoComplete="off"
              placeholder="Find a column…"
              aria-label="Find a column"
              className="h-8 w-full rounded-[6px] border border-line-strong bg-surface px-2 text-[12.5px] text-ink placeholder:text-ink-4"
            />
          </div>
          <div className="flex items-center gap-3 px-3 pb-1 text-[12px]">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={() => setView({ hidden: [] })}>
              Show all
            </button>
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={() => setView({ hidden: columns.slice(1).map((c) => c.id) })}>
              Hide all
            </button>
            <button type="button" className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-ink-3 hover:text-ink" onClick={() => setView({ hidden: DEFAULT_VIEW.hidden, order: [], pinned: [], widths: {} })}>
              Reset
            </button>
          </div>
          {!q && depts.length > 1 ? (
            <>
              <Heading>Whole sections</Heading>
              <div className="flex flex-wrap gap-x-3 px-3 pb-1">
                {depts.map((d) => (
                  <label key={d.id} className="flex min-h-[28px] cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
                    <input type="checkbox" className="h-4 w-4 accent-accent" checked={shownDepts.includes(d.id)} onChange={(e) => onToggleDept(d.id, e.target.checked)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </>
          ) : null}
          {[{ id: 'lot', label: 'Lot' }, ...DEPARTMENTS].map((d) => {
            const cols = columns.filter((c) => c.dept === d.id && match(c));
            if (cols.length === 0) return null;
            return (
              <div key={d.id}>
                <Heading>{deptLabel(d.id)}</Heading>
                {cols.map((c) => (
                  <label key={c.id} className="flex min-h-[28px] cursor-pointer items-center gap-2 px-3 text-[12.5px] text-ink-2 hover:bg-accent-soft">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      checked={!view.hidden.includes(c.id)}
                      onChange={(e) => setView({ hidden: e.target.checked ? view.hidden.filter((id) => id !== c.id) : [...view.hidden, c.id] })}
                    />
                    <span className="min-w-0 truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </>
      )}
    </Menu>
  );
}

/* ------------------------------------------------------------------ display menu */

export function DisplayMenu({ view, setView }: { view: MasterView; setView: (patch: Partial<MasterView>) => void }) {
  const densities: { id: Density; label: string }[] = [
    { id: 'compact', label: 'Compact' },
    { id: 'normal', label: 'Normal' },
    { id: 'roomy', label: 'Roomy' },
  ];
  return (
    <Menu label="Display options" width={230} trigger="Display">
      {() => (
        <>
          <Heading>Row height</Heading>
          {densities.map((d) => (
            <label key={d.id} className="flex min-h-[30px] cursor-pointer items-center gap-2 px-3 text-[12.5px] text-ink-2 hover:bg-accent-soft">
              <input type="radio" name="density" className="h-4 w-4 accent-accent" checked={view.density === d.id} onChange={() => setView({ density: d.id })} />
              {d.label}
            </label>
          ))}
          <Heading>Cells</Heading>
          <label className="flex min-h-[30px] cursor-pointer items-center gap-2 px-3 text-[12.5px] text-ink-2 hover:bg-accent-soft">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={view.wrap} onChange={(e) => setView({ wrap: e.target.checked })} />
            Wrap long text
          </label>
          <label className="flex min-h-[30px] cursor-pointer items-center gap-2 px-3 text-[12.5px] text-ink-2 hover:bg-accent-soft">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={view.filterRow} onChange={(e) => setView({ filterRow: e.target.checked })} />
            Show the filter row
          </label>
        </>
      )}
    </Menu>
  );
}

/* ---------------------------------------------------------------------- views menu */

export function ViewsMenu({
  saved,
  onApply,
  onSave,
  onDelete,
  onReset,
}: {
  saved: SavedView[];
  onApply: (v: SavedView) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  onReset: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <Menu label="Saved views" width={280} trigger="Views">
      {(close) => (
        <>
          <button type="button" className={menuItem} onClick={() => { onReset(); close(); }}>
            Standard view
          </button>
          {saved.length > 0 ? <Heading>Saved views</Heading> : null}
          {saved.map((s) => (
            <div key={s.name} className="flex items-center hover:bg-accent-soft">
              <button type="button" className={`${menuItem} flex-1 min-w-0`} onClick={() => { onApply(s); close(); }}>
                <span className="truncate">{s.name}</span>
              </button>
              <button type="button" aria-label={`Delete view ${s.name}`} className="h-8 w-8 cursor-pointer border-0 bg-transparent text-ink-3 hover:text-danger" onClick={() => onDelete(s.name)}>
                ×
              </button>
            </div>
          ))}
          <Heading>Save this view</Heading>
          <form
            className="flex gap-2 px-3 pb-1"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return;
              onSave(n);
              setName('');
              close();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              name="viewName"
              autoComplete="off"
              placeholder="Name this view…"
              aria-label="Name this view"
              className="h-8 min-w-0 flex-1 rounded-[6px] border border-line-strong bg-surface px-2 text-[12.5px] text-ink placeholder:text-ink-4"
            />
            <button type="submit" disabled={!name.trim()} className={btn}>
              Save
            </button>
          </form>
          <p className="m-0 px-3 pb-1 pt-1 text-[11.5px] text-ink-3">Remembers the columns, their order, widths, sort and filters on this device.</p>
        </>
      )}
    </Menu>
  );
}

/* --------------------------------------------------------------------- export menu */

export function ExportMenu({
  exporting,
  selected,
  total,
  onExport,
}: {
  exporting: boolean;
  selected: number;
  total: number;
  onExport: (kind: 'xlsx' | 'csv', scope: 'all' | 'selected') => void;
}) {
  return (
    <Menu label="Export" width={250} align="right" trigger={exporting ? 'Exporting…' : 'Export'}>
      {(close) => (
        <>
          <Heading>Everything that matches</Heading>
          <button type="button" className={menuItem} disabled={exporting || total === 0} onClick={() => { onExport('xlsx', 'all'); close(); }}>
            Excel file (.xlsx)
          </button>
          <button type="button" className={menuItem} disabled={exporting || total === 0} onClick={() => { onExport('csv', 'all'); close(); }}>
            CSV file (.csv)
          </button>
          <Heading>Only the selected rows</Heading>
          <button type="button" className={menuItem} disabled={exporting || selected === 0} onClick={() => { onExport('xlsx', 'selected'); close(); }}>
            Excel file ({selected})
          </button>
          <button type="button" className={menuItem} disabled={exporting || selected === 0} onClick={() => { onExport('csv', 'selected'); close(); }}>
            CSV file ({selected})
          </button>
        </>
      )}
    </Menu>
  );
}

/* ------------------------------------------------------------------ column header menu */

export function HeaderMenu({
  column,
  sortable,
  sorted,
  pinned,
  canMoveLeft,
  canMoveRight,
  actions,
}: {
  column: ColumnSpec;
  sortable: boolean;
  sorted: 'asc' | 'desc' | null;
  pinned: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  actions: {
    sort: (dir: 'asc' | 'desc' | null) => void;
    hide: () => void;
    showOnly: () => void;
    pin: () => void;
    move: (step: -1 | 1) => void;
    resetWidth: () => void;
    /** Only for the Master Excel's own custom columns, and only offered to admins. */
    remove?: () => void;
  };
}) {
  return (
    <Menu
      label={`${column.label} column options`}
      width={210}
      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-[14px] leading-none text-ink-3 hover:bg-accent-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      trigger={<span aria-hidden>⋮</span>}
    >
      {(close) => {
        const run = (fn: () => void) => () => {
          fn();
          close();
        };
        return (
          <>
            {sortable ? (
              <>
                <button type="button" className={menuItem} onClick={run(() => actions.sort('asc'))}>
                  {sorted === 'asc' ? '✓ ' : ''}Sort A → Z
                </button>
                <button type="button" className={menuItem} onClick={run(() => actions.sort('desc'))}>
                  {sorted === 'desc' ? '✓ ' : ''}Sort Z → A
                </button>
                {sorted ? (
                  <button type="button" className={menuItem} onClick={run(() => actions.sort(null))}>
                    Clear sort
                  </button>
                ) : null}
                <div className="my-1 border-t border-line-soft" />
              </>
            ) : null}
            <button type="button" className={menuItem} onClick={run(actions.pin)}>
              {pinned ? 'Unpin column' : 'Pin to the left'}
            </button>
            <button type="button" className={menuItem} disabled={!canMoveLeft} onClick={run(() => actions.move(-1))}>
              Move left
            </button>
            <button type="button" className={menuItem} disabled={!canMoveRight} onClick={run(() => actions.move(1))}>
              Move right
            </button>
            <button type="button" className={menuItem} onClick={run(actions.resetWidth)}>
              Reset width
            </button>
            <div className="my-1 border-t border-line-soft" />
            <button type="button" className={menuItem} onClick={run(actions.hide)}>
              Hide column
            </button>
            <button type="button" className={menuItem} onClick={run(actions.showOnly)}>
              Show only this column
            </button>
            {actions.remove ? (
              <>
                <div className="my-1 border-t border-line-soft" />
                <button type="button" className={`${menuItem} !text-danger`} onClick={run(actions.remove)}>
                  Remove column
                </button>
              </>
            ) : null}
          </>
        );
      }}
    </Menu>
  );
}
