'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { IconChevronDown, IconPlus, IconSearch, IconX } from '@/components/ui/icons';
import { Kbd } from '@/components/ui/Kbd';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Building blocks of the compact filter bar: a search box, quick views, "+ Filter" menu, chips that
 * open their own value panel, and the floating panel they share. The panel is `fixed`, so a table or
 * a scrolling page never clips it. Everything works from the keyboard: Enter/Space opens, arrows move
 * through the options, Esc closes and gives focus back to the button that opened it.
 */

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/* -------------------------------------------------------------------------- panel */

/** A floating panel under `anchor`. Closes on Esc, outside press, resize or scroll of the page. */
export function FilterPanel({
  anchor,
  open,
  onClose,
  width = 280,
  label,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  width?: number;
  label: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(width, window.innerWidth - 16);
    const below = window.innerHeight - r.bottom - 12;
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      maxH: Math.max(220, Math.min(420, below)),
    });
  }, [open, anchor, width]);

  // Move focus into the panel once it is placed, so the keyboard can carry on from the button.
  useEffect(() => {
    if (!open || !pos) return;
    const el = panel.current;
    if (!el) return;
    const target =
      el.querySelector<HTMLElement>('[data-autofocus]') ??
      el.querySelector<HTMLElement>('[aria-selected="true"], button, input');
    target?.focus({ preventScroll: true });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      anchor.current?.focus();
    };
    const shut = () => onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', shut);
    };
  }, [open, onClose, anchor]);

  if (!open || !pos) return null;
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxH }}
      className="fixed z-[120] flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface shadow-lift"
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------- option list */

export interface FilterOption {
  value: string;
  label: string;
  /** A short secondary line (e.g. a count or a hint). */
  hint?: string;
}

/** Pick one option. Over eight options it gets a search box on top. Arrow keys move, Enter picks. */
export function OptionList({
  options,
  value,
  onPick,
  placeholder = 'Find…',
  empty = 'Nothing to choose from.',
}: {
  options: FilterOption[];
  value: string;
  onPick: (value: string) => void;
  placeholder?: string;
  empty?: string;
}) {
  const [q, setQ] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const searchable = options.length > 8;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);

  const move = (from: HTMLElement | null, step: number) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (items.length === 0) return;
    const i = from ? items.indexOf(from) : -1;
    const next = i === -1 ? (step > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, i + step));
    items[next]?.focus();
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(t.getAttribute('role') === 'option' ? t : null, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (t.getAttribute('role') === 'option') move(t, -1);
    } else if (e.key === 'Home' && t.getAttribute('role') === 'option') {
      e.preventDefault();
      move(null, 1);
    } else if (e.key === 'End' && t.getAttribute('role') === 'option') {
      e.preventDefault();
      move(null, -1);
    } else if (e.key === 'Enter' && t.tagName === 'INPUT' && shown[0]) {
      e.preventDefault();
      onPick(shown[0].value);
    }
  };

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKey}>
      {searchable ? (
        <div className="border-b border-line-soft p-2">
          <input
            data-autofocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            name="filter-find"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-[6px] border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-4"
          />
        </div>
      ) : null}
      <ul ref={list} role="listbox" className="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-1.5">
        {shown.length === 0 ? <li className="px-3 py-4 text-center text-[12.5px] text-ink-3">{q ? 'No match.' : empty}</li> : null}
        {shown.map((o) => {
          const selected = o.value === value;
          return (
            <li key={o.value || '∅'} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onPick(o.value)}
                className={`flex min-h-[38px] w-full cursor-pointer touch-manipulation items-center gap-2 rounded-[6px] border-0 px-2.5 text-left text-[13px] transition-colors ${focusRing} ${
                  selected ? 'bg-accent-soft font-semibold text-accent' : 'bg-transparent text-ink-2 hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full border ${selected ? 'border-[4px] border-accent' : 'border-line-strong'}`} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint ? <span className="shrink-0 text-[11.5px] tabular-nums text-ink-4">{o.hint}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- chip */

/** `Stage: Intake ×`. The text opens the value panel; the × removes the filter. */
export function FilterChip({
  name,
  valueText,
  open,
  onOpenChange,
  onRemove,
  panelWidth,
  children,
}: {
  name: string;
  /** Empty while the filter was just added and still has no value. */
  valueText: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  panelWidth?: number;
  children: ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <span className="inline-flex max-w-full items-stretch overflow-hidden rounded-full border border-line-strong bg-accent-soft text-[12.5px] shadow-control">
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={valueText ? `${name}: ${valueText}. Change` : `${name}. Choose a value`}
        onClick={() => onOpenChange(!open)}
        className={`flex min-h-[32px] min-w-0 cursor-pointer touch-manipulation items-center gap-1.5 border-0 bg-transparent py-0 pl-3 pr-1.5 text-left transition-colors hover:bg-accent/10 ${focusRing}`}
      >
        <span className="shrink-0 font-semibold text-ink-3">{name}</span>
        <span className={`min-w-0 truncate font-semibold ${valueText ? 'text-accent' : 'text-ink-4'}`}>{valueText || 'Choose…'}</span>
        <IconChevronDown size={13} className="shrink-0 text-ink-3" />
      </button>
      <button
        type="button"
        aria-label={`Remove filter ${name}`}
        onClick={onRemove}
        className={`flex w-8 shrink-0 cursor-pointer touch-manipulation items-center justify-center border-0 border-l border-line bg-transparent text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger ${focusRing}`}
      >
        <IconX size={13} />
      </button>
      <FilterPanel anchor={btn} open={open} onClose={() => onOpenChange(false)} width={panelWidth} label={`${name} filter`}>
        {children}
      </FilterPanel>
    </span>
  );
}

/* ---------------------------------------------------------------------- + Filter */

export interface AddableFilter {
  id: string;
  label: string;
  /** True once this filter is on the bar (it then cannot be added twice). */
  used: boolean;
}

/** The "+ Filter" button: a menu of the filters not yet on the bar. */
export function AddFilterMenu({
  filters,
  open,
  onOpenChange,
  onAdd,
}: {
  filters: AddableFilter[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (id: string) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const free = filters.filter((f) => !f.used);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        disabled={free.length === 0}
        className={`inline-flex min-h-[32px] cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent disabled:cursor-default disabled:opacity-50 ${focusRing}`}
      >
        <IconPlus size={13} />
        Filter
      </button>
      <FilterPanel anchor={btn} open={open} onClose={() => onOpenChange(false)} width={240} label="Add a filter">
        <OptionList
          options={free.map((f) => ({ value: f.id, label: f.label }))}
          value=""
          onPick={(id) => onAdd(id)}
          empty="Every filter is already on the bar."
        />
      </FilterPanel>
    </>
  );
}

/* ------------------------------------------------------------------- quick views */

export interface QuickView {
  id: string;
  label: string;
  active: boolean;
  onApply: () => void;
}

/** One-click presets. Each is just a set of the same chips, so it stays editable afterwards. */
export function QuickViews({ views }: { views: QuickView[] }) {
  return (
    <div role="group" aria-label="Quick views" className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={v.active}
          onClick={v.onApply}
          className={`min-h-[30px] cursor-pointer touch-manipulation rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${focusRing} ${
            v.active ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- search */

/** The search box: `/` jumps to it from anywhere on the page, Esc clears it, the × empties it. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative min-w-0 flex-1">
      <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        name="lot-search"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full min-w-0 rounded-[8px] border border-line-strong bg-surface pl-9 pr-16 text-[13px] text-ink shadow-control placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onChange('');
              input.current?.focus();
            }}
            className={`flex h-7 w-7 cursor-pointer touch-manipulation items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface-sunken hover:text-ink ${focusRing}`}
          >
            <IconX size={14} />
          </button>
        ) : (
          <span className="hidden sm:inline-flex">
            <Kbd keys={['/']} label="Press slash to search" />
          </span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- date range */

/** Local calendar day as `YYYY-MM-DD` (never via UTC, which can shift the day). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
};
export const monthStart = () => {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
};

const RANGE_PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [daysAgo(0), daysAgo(0)] },
  { label: 'Last 7 days', range: () => [daysAgo(7), daysAgo(0)] },
  { label: 'Last 30 days', range: () => [daysAgo(30), daysAgo(0)] },
  { label: 'This month', range: () => [monthStart(), daysAgo(0)] },
  { label: 'This year', range: () => [isoDay(new Date(new Date().getFullYear(), 0, 1)), daysAgo(0)] },
];

/** Two dates and one-click ranges. Every change applies at once. */
export function DateRangePanel({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            data-autofocus={p.label === 'Last 7 days' ? '' : undefined}
            onClick={() => onChange(...p.range())}
            className="min-h-[32px] cursor-pointer touch-manipulation rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-ink-2 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-ink-2">
          From
          <DatePicker value={from} onChange={(v) => onChange(v, to)} aria-label="Received from date" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-ink-2">
          To
          <DatePicker value={to} onChange={(v) => onChange(from, v)} aria-label="Received to date" />
        </label>
      </div>
    </div>
  );
}
