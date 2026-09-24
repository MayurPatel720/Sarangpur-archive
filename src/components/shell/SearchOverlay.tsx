'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useDrawer } from '@/components/shell/drawer-context';
import { SIDEBAR_OFFSET_CLASS } from '@/lib/shell';
import { date } from '@/lib/format';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Badge, ErrorState, Skeleton } from '@/components/ui/primitives';
import { Kbd } from '@/components/ui/Kbd';
import { IconSearch } from '@/components/ui/icons';

type FormatChip = string;
type StageChip = string;
type DecisionChip = string;
type DataTypeChip = string;

const debounceMs = 200;

type FilterOption = { value: string; label: string };

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`h-7 px-2.5 rounded-full text-[11.5px] font-medium border cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 transition-colors duration-150 ${
          value
            ? 'bg-strong-bg text-on-strong border-strong-bg'
            : 'bg-surface text-ink-3 border-line hover:text-ink hover:border-line-strong'
        }`}
      >
        <span className={value ? 'opacity-70' : 'text-ink-4'}>{label}</span>
        <span>{selected?.label ?? 'All'}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2.5 3.75L5 6.25L7.5 3.75"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full mt-1.5 z-20 min-w-[148px] max-h-[320px] overflow-y-auto bg-surface border border-line rounded-[8px] shadow-lift py-1"
        >
          {options.map((opt) => {
            const isSel = opt.value === value;
            return (
              <button
                key={opt.value || '__all'}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-[12.5px] cursor-pointer hover:bg-surface-sunken ${
                  isSel ? 'text-ink font-semibold' : 'text-ink-2'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Spotlight-style global search. Opens with ⌘/Ctrl+K or the header bar.
 * Queries GET /api/search (lots + item codes) with format/stage/decision chips.
 */
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: me } = useMe();
  const { collapsed } = useDrawer();
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const stages = useReferenceList('stage');
  const decisions = useReferenceList('decision');

  const [rawQ, setRawQ] = useState('');
  const [q, setQ] = useState('');
  const [format, setFormat] = useState<FormatChip>('');
  const [dataType, setDataType] = useState<DataTypeChip>('');
  const [stage, setStage] = useState<StageChip>('');
  const [decision, setDecision] = useState<DecisionChip>('');
  const [active, setActive] = useState(0);

  const formatLabel = (value: string): string =>
    formats.data?.items.find((f) => f.value === value)?.label ?? value;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(rawQ.trim()), debounceMs);
    return () => window.clearTimeout(t);
  }, [rawQ]);

  const hasFilter = Boolean(format || dataType || stage || decision);
  const hasQuery = q.length > 0 || hasFilter;

  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (format) params.format = format;
  if (dataType) params.dataType = dataType;
  if (stage) params.stage = stage;
  if (decision) params.decision = decision;
  params.page = '1';
  params.pageSize = '10';
  const paramKey = JSON.stringify(params);

  const can = me?.grants.includes('lot:view') ?? false;
  const enabled = Boolean(me) && can && hasQuery;

  const results = useQuery({
    queryKey: queryKeys.search.query(paramKey),
    queryFn: () => searchApi.global(params),
    enabled,
  });

  const rows = results.data?.rows ?? [];
  const total = results.data?.total ?? 0;

  useEffect(() => {
    setActive(0);
  }, [paramKey]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (id: string) => {
    onClose();
    router.push(`/register/${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const row = rows[active];
      if (row) {
        e.preventDefault();
        go(row.id);
      }
    }
  };

  const err = results.error as ApiRequestError | null;
  const showHint = !hasQuery && !results.isFetching;

  return (
    <div
      className={`fixed inset-y-0 right-0 left-0 z-[100] flex items-start justify-center pt-[12vh] px-4 ${
        collapsed ? SIDEBAR_OFFSET_CLASS.collapsed : SIDEBAR_OFFSET_CLASS.expanded
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 border-0 cursor-default"
      />

      <div className="relative w-full max-w-[640px] bg-surface border border-line rounded-[12px] shadow-lift flex flex-col max-h-[80vh]">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line-soft flex-shrink-0">
          <IconSearch size={17} className="flex-shrink-0 text-ink-4" />
          <input
            ref={inputRef}
            type="text"
            value={rawQ}
            onChange={(e) => setRawQ(e.target.value)}
            placeholder="Search lots, item codes, owners, paths…"
            className="search-overlay-input flex-1 h-full bg-transparent border-0 text-[15px] text-ink placeholder:text-ink-4 outline-none focus:outline-none focus-visible:outline-none"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="search-results"
            aria-activedescendant={rows[active] ? `search-row-${rows[active]!.id}` : undefined}
            aria-autocomplete="list"
          />
          <span className="flex-shrink-0 hidden sm:block">
            <Kbd keys={['⌘', 'K']} label="Command K" />
          </span>
        </div>

        <div className="px-3 py-2.5 border-b border-line-soft flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FilterDropdown
              label="Format"
              value={format}
              onChange={(v) => setFormat(v as FormatChip)}
              options={[
                { value: '', label: 'All' },
                ...(formats.data?.items ?? []).map((f) => ({ value: f.value, label: f.label })),
              ]}
            />
            <FilterDropdown
              label="Type"
              value={dataType}
              onChange={(v) => setDataType(v as DataTypeChip)}
              options={[
                { value: '', label: 'All' },
                ...(dataTypes.data?.items ?? []).map((t) => ({ value: t.value, label: t.label })),
              ]}
            />
            <FilterDropdown
              label="Stage"
              value={stage}
              onChange={(v) => setStage(v as StageChip)}
              options={[
                { value: '', label: 'All' },
                ...(stages.data?.items ?? []).map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
            <FilterDropdown
              label="Decision"
              value={decision}
              onChange={(v) => setDecision(v as DecisionChip)}
              options={[
                { value: '', label: 'All' },
                ...(decisions.data?.items ?? []).map((d) => ({ value: d.value, label: d.label })),
              ]}
            />
          </div>
        </div>

        <div
          id="search-results"
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto min-h-[80px]"
        >
          {showHint ? (
            <div className="px-4 py-8 text-[12.5px] text-ink-4 text-center">
              Type a lot ref, owner, or item code — or pick filters above.
            </div>
          ) : results.isPending && enabled ? (
            <div className="p-3 flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-[6px]" />
              ))}
            </div>
          ) : err ? (
            <div className="p-3">
              <ErrorState
                message={err.message}
                hint={err.hint}
                onRetry={() => void results.refetch()}
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-[12.5px] text-ink-4 text-center">
              No matches. Try a lot reference, owner, or item code.
            </div>
          ) : (
            <ul className="m-0 p-1.5 list-none">
              {rows.map((row, i) => (
                <li key={row.id}>
                  <button
                    type="button"
                    id={`search-row-${row.id}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(row.id)}
                    className={`w-full text-left px-2.5 py-2.5 rounded-[8px] border border-transparent cursor-pointer flex gap-3 items-start ${
                      i === active ? 'bg-surface-sunken' : 'bg-transparent'
                    }`}
                  >
                    <span className="w-9 h-9 rounded-[7px] bg-surface-sunken border border-line flex items-center justify-center text-[10px] font-semibold text-ink-3 flex-shrink-0 mt-0.5">
                      {formatLabel(row.format).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[12.5px] font-medium text-accent">
                          {row.namingCode ?? row.lotReference}
                        </span>
                        <Badge severity={row.returnSeverity}>
                          <span className="capitalize">{row.stage.replace('_', ' ')}</span>
                        </Badge>
                      </span>
                      <span className="text-[12px] text-ink-3 truncate">
                        {row.ownerName}
                        {' · '}
                        {formatLabel(row.format)}
                        {' · '}
                        {date(row.dateReceived)}
                        {row.matchedItems[0] ? (
                          <span className="text-ink-2">
                            {' · '}
                            <span className="font-mono">{row.matchedItems[0].code}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-ink-4 mt-1">
                      {i === active ? <Kbd keys={['↵']} label="Enter" /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="h-9 px-3 border-t border-line-soft flex items-center gap-3 text-[11px] text-ink-4 flex-shrink-0">
          <span className="flex items-center gap-1">
            <Kbd keys={['↑', '↓']} label="Arrow keys" /> Navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd keys={['↵']} label="Enter" /> Open
          </span>
          <span className="flex items-center gap-1">
            <Kbd keys={['Esc']} label="Escape" /> Close
          </span>
          {hasQuery && results.data ? (
            <span className="ml-auto tnum">
              Showing {rows.length} of {total} result{total === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
