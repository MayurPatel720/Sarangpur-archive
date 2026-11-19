'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The one menu of a sheet (Master Excel and a lot's Items sheet): everything about columns, display and layout.
 * It opens on a right-click (anywhere on the sheet, or on a column heading for that column's own actions) and on a
 * click on a heading's ⋮. Build its content from the small pieces below.
 */

export interface MenuPos {
  x: number;
  y: number;
}

/** Open / close state of the sheet menu; `columnId` is the heading it was opened on (none: opened on the sheet). */
export function useSheetMenu<C = string>() {
  const [state, setState] = useState<{ pos: MenuPos; column: C | null } | null>(null);
  const openAt = (pos: MenuPos, column: C | null = null) => setState({ pos, column });
  const close = () => setState(null);
  /** For a wrapper: right-click opens the menu unless the person is typing in a box (the browser's own menu stays there). */
  const onContextMenu = (e: ReactMouseEvent, column: C | null = null) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"], .ag-cell-inline-editing')) return;
    e.preventDefault();
    e.stopPropagation();
    openAt({ x: e.clientX, y: e.clientY }, column);
  };
  return { state, openAt, close, onContextMenu };
}

/** The panel itself: kept inside the window, scrolls when long, closes on Escape / a click outside / scrolling the page. */
export function SheetMenu({ pos, onClose, label, children }: { pos: MenuPos; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<MenuPos>(pos);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAt({
      x: Math.max(8, Math.min(pos.x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(pos.y, window.innerHeight - r.height - 8)),
    });
  }, [pos]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      if (e.type === 'scroll' && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{ left: at.x, top: at.y }}
      className="fixed z-[200] w-[250px] rounded-[8px] border border-line bg-surface py-1 shadow-panel"
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

const row =
  'flex min-h-[30px] w-full items-center gap-2 border-0 bg-transparent px-3 text-left text-[12.5px] text-ink cursor-pointer hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none disabled:cursor-default disabled:text-ink-4 disabled:hover:bg-transparent';

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">{children}</div>;
}

/**
 * A menu row that opens a dropdown beside it (Columns, Display …). Opens on hover or click; the dropdown scrolls when
 * it is long and flips to the left when there is no room on the right.
 */
export function MenuSub({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; maxH: number }>({ left: 0, top: 0, maxH: 400 });

  useLayoutEffect(() => {
    if (!open || !wrap.current || !panel.current) return;
    const r = wrap.current.getBoundingClientRect();
    const w = panel.current.offsetWidth;
    const maxH = Math.min(window.innerHeight - 16, 560);
    const h = Math.min(panel.current.scrollHeight, maxH);
    const left = r.right + w + 8 <= window.innerWidth ? r.right + 2 : Math.max(8, r.left - w - 2);
    const top = Math.max(8, Math.min(r.top - 4, window.innerHeight - h - 8));
    setAt({ left, top, maxH });
  }, [open]);

  return (
    <div ref={wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${row} ${open ? 'bg-accent-soft' : ''}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {note ? <span className="text-[11px] text-ink-4">{note}</span> : null}
        <span aria-hidden className="text-ink-4">
          ▸
        </span>
      </button>
      {open ? (
        <div
          ref={panel}
          role="menu"
          aria-label={label}
          style={{ left: at.left, top: at.top, maxHeight: at.maxH }}
          className="fixed z-[210] w-[290px] overflow-y-auto overscroll-contain rounded-[8px] border border-line bg-surface py-1 shadow-panel"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-line-soft" />;
}

/** A plain action; the menu closes after it unless `keepOpen`. */
export function MenuAction({
  children,
  onClick,
  onClose,
  disabled,
  danger,
  note,
  keepOpen,
}: {
  children: ReactNode;
  onClick: () => void;
  onClose: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Small grey text on the right. */
  note?: string;
  keepOpen?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`${row} ${danger ? '!text-danger' : ''}`}
      onClick={() => {
        onClick();
        if (!keepOpen) onClose();
      }}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {note ? <span className="text-[11px] text-ink-4">{note}</span> : null}
    </button>
  );
}

/** A tick box row (stays open so several can be ticked). */
export function MenuCheck({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <label className={`${row} cursor-pointer`}>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

export function MenuRadio({ checked, onChange, name, children }: { checked: boolean; onChange: () => void; name: string; children: ReactNode }) {
  return (
    <label className={`${row} cursor-pointer`}>
      <input type="radio" name={name} className="h-4 w-4 shrink-0 accent-accent" checked={checked} onChange={onChange} />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

export interface PickerColumn {
  id: string;
  label: string;
  /** The department / group heading it sits under. */
  group: string;
  checked: boolean;
  /** Cannot be hidden (the Archive code). */
  locked?: boolean;
}

/** "Show or hide columns": a search box and every column, ticked when shown, grouped. */
export function ColumnsPicker({
  columns,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  columns: PickerColumn[];
  onToggle: (id: string, on: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const shown = t ? columns.filter((c) => c.label.toLowerCase().includes(t)) : columns;
  const groups = [...new Set(shown.map((c) => c.group))];
  return (
    <div>
      <div className="px-3 pb-1 pt-1">
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
      </div>
      <div className="flex items-center gap-3 px-3 pb-1 text-[12px]">
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={onShowAll}>
          Show all
        </button>
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={onHideAll}>
          Hide all
        </button>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div className="px-3 pt-1 text-[11px] font-semibold text-ink-3">{g}</div>
          {shown
            .filter((c) => c.group === g)
            .map((c) => (
              <label key={c.id} className={`${row} ${c.locked ? 'cursor-default opacity-70' : 'cursor-pointer'}`}>
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={c.checked} disabled={c.locked} onChange={(e) => onToggle(c.id, e.target.checked)} />
                <span className="min-w-0 truncate">{c.label}</span>
              </label>
            ))}
        </div>
      ))}
      {shown.length === 0 ? <p className="m-0 px-3 py-2 text-[12.5px] text-ink-3">No column matches.</p> : null}
    </div>
  );
}

/** Save layout / Undo layout changes (see hooks/useServerLayout). */
export function LayoutSection({
  layout,
  onClose,
  children,
}: {
  layout: { dirty: boolean; saving: boolean; save: () => void; discard: () => void };
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      <MenuHeading>Layout</MenuHeading>
      <MenuAction onClick={layout.save} onClose={onClose} disabled={!layout.dirty || layout.saving} note={layout.dirty ? undefined : 'saved'}>
        {layout.saving ? 'Saving…' : 'Save layout'}
      </MenuAction>
      <MenuAction onClick={layout.discard} onClose={onClose} disabled={!layout.dirty}>
        Undo layout changes
      </MenuAction>
      {children}
    </>
  );
}
