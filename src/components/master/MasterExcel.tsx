'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiRequestError, masterApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useFormatContext } from '@/hooks/useFormatParam';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useReferenceLists } from '@/hooks/useReferenceLists';
import { refLabel as refLabelOf } from '@/lib/ref-lists';
import { photoThumbUrl } from '@/lib/project-photos';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { cellText } from '@/lib/item-cells';
import { forFormat, isCommonColumn, DEPARTMENTS, deptLabel, type ColumnSpec } from '@/lib/item-columns';
import { MASTER_COLUMNS, MASTER_FILTERS, MASTER_SORTABLE_IDS, type MasterFilter } from '@/lib/master-columns';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { num } from '@/lib/format';
import type { MasterRow } from '@/types/master';
import { buildItemsWorkbook } from '@/components/lots/excel-io';
import { applyView, DEFAULT_VIEW, MAX_WIDTH, MIN_WIDTH, moveColumn, ROW_PADDING, useMasterView } from '@/components/master/master-view';
import { ColumnsMenu, DisplayMenu, ExportMenu, HeaderMenu, ViewsMenu, toolbarButton } from '@/components/master/MasterMenus';

/**
 * The Master Excel: every item of every lot (and its project) in one sheet. Read only — items are
 * edited in their own lot's Excel (click a lot no or archive code).
 *
 * Spreadsheet tools: a filter row under the column names, server-side sorting and paging, a column
 * picker, per-column menus (sort, hide, pin, move, resize), row selection, copy to paste into Excel,
 * Excel / CSV export of what is shown, row height and wrapping, full screen, filter chips, and saved
 * views. How the sheet looks is remembered per format on this device.
 */

const BANDS = [{ id: 'lot', label: 'Lot' }, ...DEPARTMENTS] as const;
const EXPORT_CAP = 20_000;
const EXPORT_PAGE = 200;
const SELECT_W = 40;
const NUM_W = 52;
const SORTABLE = new Set(MASTER_SORTABLE_IDS);

const inputCls =
  'h-7 w-full min-w-0 rounded-[4px] border border-line bg-surface px-1.5 text-[12px] text-ink placeholder:text-ink-4';

/** True on phone-width screens (below 640px). */
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

const clamp = (n: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(n)));

function FilterCell({
  filter,
  value,
  onChange,
  options,
  label,
}: {
  filter: MasterFilter | undefined;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  if (!filter) return null;
  if (filter.type === 'select' && !Array.isArray(filter.options) && typeof filter.options === 'object') {
    return <ListFilterSelect list={filter.options.list} value={value} onChange={onChange} label={label} />;
  }
  if (filter.type === 'text') {
    return (
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter…"
        name={`filter-${filter.param}`}
        autoComplete="off"
        aria-label={`Filter ${label}`}
      />
    );
  }
  const opts =
    filter.type === 'yesno'
      ? [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'blank', label: 'Blank' },
        ]
      : options;
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Filter ${label}`}>
      <option value="">All</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A filter whose options are an admin-managed list (Guru, Category, Room …). */
function ListFilterSelect({ list, value, onChange, label }: { list: string; value: string; onChange: (v: string) => void; label: string }) {
  const q = useReferenceList(list);
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Filter ${label}`}>
      <option value="">All</option>
      {(q.data?.items ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;
const tsvCell = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

export function MasterExcel() {
  const toast = useToast();
  const format = useFormatContext();
  const stages = useReferenceList('stage');
  const dataTypes = useReferenceList('dataType');
  const { view, setView, saved, saveView, deleteView } = useMasterView(format ?? 'all');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [full, setFull] = useState(false);
  const allBox = useRef<HTMLInputElement>(null);
  const phone = usePhone();
  const [moreOpen, setMoreOpen] = useState(false);
  const [phoneFilters, setPhoneFilters] = useState(false);
  /** Phones skip the row-number column, pin only one column and keep the filter row folded away until asked for. */
  const numW = phone ? 0 : NUM_W;
  const lead = phone ? 1 : 2;
  const filterRowOn = phone ? phoneFilters : view.filterRow;

  // Filters apply after a short pause in typing, from page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);
  useEffect(() => setPage(1), [format]);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setFull(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [full]);

  const optionsFor = (f: MasterFilter): { value: string; label: string }[] => {
    if (f.type !== 'select') return [];
    if (f.options === 'stage') return (stages.data?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    if (f.options === 'dataType') return (dataTypes.data?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    if (f.options === 'physicalSource') return [];
    if (!Array.isArray(f.options)) return []; // a { list } filter loads its own options
    return f.options;
  };
  const { lists: refLists } = useReferenceLists();
  const refLabel = useCallback((list: string, v: string | null) => refLabelOf(refLists, list, v), [refLists]);

  const sort = view.sort && SORTABLE.has(view.sort) ? view.sort : '';
  const params = useMemo(() => {
    const p: Record<string, string | number | undefined> = { ...applied, format, page, pageSize, sort: sort || undefined, dir: sort ? view.dir : undefined };
    return p;
  }, [applied, format, page, pageSize, sort, view.dir]);
  const key = JSON.stringify(params);
  const list = useQuery({
    queryKey: queryKeys.master.list(key),
    queryFn: () => masterApi.list(params),
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  // A new page of rows starts with nothing selected.
  useEffect(() => setSelected(new Set()), [key]);

  // One format chosen (e.g. Prasadi): that format's full column set. "All formats": only the columns
  // every format has — a format's own columns need that format picked (and Export writes a sheet each).
  const viewCols = useMemo(() => (format ? forFormat(MASTER_COLUMNS, format) : MASTER_COLUMNS.filter(isCommonColumn)), [format]);
  const shownDepts = view.depts ?? BANDS.map((b) => b.id);
  const baseColumns = useMemo(() => viewCols.filter((c) => shownDepts.includes(c.dept)), [viewCols, shownDepts]);
  const columns = useMemo(() => applyView(baseColumns, view), [baseColumns, view]);
  const visibleBands = useMemo(() => BANDS.filter((b) => b.id === 'lot' || viewCols.some((c) => c.dept === b.id)), [viewCols]);

  const bands = useMemo(() => {
    const out: { id: string; label: string; span: number }[] = [];
    for (const c of columns) {
      const last = out[out.length - 1];
      if (last && last.id === c.dept) last.span += 1;
      else out.push({ id: c.dept, label: deptLabel(c.dept), span: 1 });
    }
    return out;
  }, [columns]);

  // Pinned columns stay put while the sheet scrolls sideways: each sits after the selection / row-number columns and the pins before it.
  const widthOf = (c: ColumnSpec) => view.widths[c.id] ?? c.width ?? 140;
  const pinLeft = useMemo(() => {
    const out = new Map<string, number>();
    let left = SELECT_W + numW;
    const pins = phone ? view.pinned.slice(0, 1) : view.pinned;
    for (const c of columns) {
      if (!pins.includes(c.id)) break;
      out.set(c.id, left);
      left += view.widths[c.id] ?? c.width ?? 140;
    }
    return out;
  }, [columns, view.pinned, view.widths, numW, phone]);

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const rows = data?.rows ?? [];

  /* ------------------------------------------------------------------- filter chips */
  const paramInfo = useMemo(() => {
    const m = new Map<string, ColumnSpec>();
    for (const c of MASTER_COLUMNS) {
      const f = MASTER_FILTERS[c.id];
      if (f) m.set(f.param, c);
    }
    return m;
  }, []);
  const chipValue = (param: string, v: string): string => {
    const c = paramInfo.get(param);
    if (c?.refList) return refLabel(c.refList, v);
    if (param === 'stage') return stages.data?.items.find((i) => i.value === v)?.label ?? v;
    if (param === 'dataType') return dataTypes.data?.items.find((i) => i.value === v)?.label ?? v;
    return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v === 'blank' ? 'Blank' : v;
  };

  /* ---------------------------------------------------------------------- selection */
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = selected.size > 0 && !allSelected;
  }, [selected, allSelected]);
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* --------------------------------------------------------------- copy and export */
  const copyRows = async (which: MasterRow[]) => {
    if (which.length === 0) return;
    const head = columns.map((c) => tsvCell(c.label)).join('\t');
    const body = which.map((r) => columns.map((c) => tsvCell(cellText(r, c, refLabel))).join('\t'));
    try {
      await navigator.clipboard.writeText([head, ...body].join('\n'));
      toast.success('Copied', `${num(which.length)} ${which.length === 1 ? 'row' : 'rows'}: paste into Excel or Sheets.`);
    } catch {
      toast.error('Could not copy', 'Your browser did not allow clipboard access.');
    }
  };

  const fetchAll = async (): Promise<MasterRow[]> => {
    const out: MasterRow[] = [];
    for (let p = 1; out.length < EXPORT_CAP; p += 1) {
      const res = await masterApi.list({ ...applied, format, sort: sort || undefined, dir: sort ? view.dir : undefined, page: p, pageSize: EXPORT_PAGE });
      out.push(...res.rows);
      if (out.length >= res.total || res.rows.length === 0) break;
    }
    return out;
  };

  const exportRows = async (kind: 'xlsx' | 'csv', scope: 'all' | 'selected') => {
    setExporting(true);
    try {
      const picked = scope === 'selected' ? rows.filter((r) => selected.has(r.id)) : await fetchAll();
      if (picked.length === 0) {
        toast.info('Nothing to export', scope === 'selected' ? 'Tick some rows first.' : 'No items match the filters.');
        return;
      }
      const stem = `master-excel${format ? `-${format}` : ''}`;
      if (kind === 'csv') {
        const head = columns.map((c) => csvCell(c.label)).join(',');
        const body = picked.map((r) => columns.map((c) => csvCell(cellText(r, c, refLabel))).join(','));
        download(new Blob([`﻿${[head, ...body].join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `${stem}.csv`);
      } else {
        // One format: one sheet, the columns as shown. All formats: one sheet per format, each with that format's own columns.
        const shownCols = MASTER_COLUMNS.filter((c) => shownDepts.includes(c.dept) && !view.hidden.includes(c.id));
        const byFormat = new Map<string, MasterRow[]>();
        for (const r of picked) byFormat.set(r.format, [...(byFormat.get(r.format) ?? []), r]);
        const sheets = format
          ? [{ name: 'Master', rows: picked, columns }]
          : [...byFormat.entries()].map(([f, fr]) => ({ name: FORMAT_LABELS[f as Format] ?? f, rows: fr, columns: forFormat(shownCols, f) }));
        const wb = await buildItemsWorkbook({ sheets, columns, refLabel });
        const buf = await wb.xlsx.writeBuffer();
        download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${stem}.xlsx`);
      }
      toast.success('Exported', `${num(picked.length)} items${scope === 'all' && data && picked.length < data.total ? ` (first ${num(EXPORT_CAP)})` : ''}.`);
    } catch (e) {
      toast.error('Could not export', e instanceof ApiRequestError ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  /* ---------------------------------------------------------------- header actions */
  const cycleSort = (id: string) =>
    setView((v) => (v.sort !== id ? { sort: id, dir: 'asc' } : v.dir === 'asc' ? { dir: 'desc' } : { sort: '', dir: 'asc' }));

  const startResize = (e: ReactPointerEvent<HTMLElement>, c: ColumnSpec) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    const startX = e.clientX;
    const startW = target.parentElement?.getBoundingClientRect().width ?? widthOf(c);
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setView((v) => ({ widths: { ...v.widths, [c.id]: clamp(startW + ev.clientX - startX) } }));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const cell = (row: MasterRow, c: ColumnSpec) => {
    const text = cellText(row, c, refLabel);
    if (c.id === 'lotNo' || c.id === 'code') {
      return (
        <Link href={`/register/${row.lotId}?tab=items`} className={`no-underline hover:underline text-accent ${c.id === 'code' ? 'font-mono' : ''}`}>
          {text}
        </Link>
      );
    }
    if (c.kind === 'photo') {
      return row.coverUrl ? (
        <Link href={`/register/${row.lotId}?tab=items`} className="inline-flex items-center gap-1.5 no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoThumbUrl(row.coverUrl)} alt="" width={28} height={28} className="h-7 w-7 rounded-[4px] object-cover" />
          <span className="text-[11.5px] text-ink-3">{row.imageCount}</span>
        </Link>
      ) : (
        <span className="text-ink-4">—</span>
      );
    }
    return text || <span className="text-ink-4">—</span>;
  };

  const resetView = () => {
    setView({ ...DEFAULT_VIEW });
    setFilters({});
  };

  const headTop = filterRowOn ? ['top-0', 'top-7', 'top-16'] : ['top-0', 'top-7'];
  const first = (page - 1) * pageSize;

  return (
    <div className={`flex min-h-0 flex-col gap-3 ${full ? 'fixed inset-0 z-[90] bg-surface p-3 text-ink md:p-4' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className={`m-0 text-[18px] font-semibold tracking-[-0.015em] text-ink ${full ? '' : 'sr-only'}`}>Master Excel{format ? ` · ${FORMAT_LABELS[format as Format]}` : ''}</h1>
        <span className="text-[12.5px] tabular-nums text-ink-3" aria-live="polite">
          {data ? `${num(data.total)} ${data.total === 1 ? 'item' : 'items'}` : ''}
        </span>
        {full ? (
          <button type="button" className={`${toolbarButton} ml-auto`} onClick={() => setFull(false)}>
            Exit full screen
          </button>
        ) : null}
      </div>

      <div role="toolbar" aria-label="Sheet tools" className="flex flex-wrap items-center gap-2">
        <ViewsMenu
          saved={saved}
          onApply={(s) => {
            setView({ ...DEFAULT_VIEW, ...s.view });
            setFilters(s.filters);
          }}
          onSave={(name) => saveView(name, filters)}
          onDelete={deleteView}
          onReset={resetView}
        />
        <ColumnsMenu
          columns={viewCols}
          view={view}
          setView={setView}
          depts={visibleBands.map((b) => ({ id: b.id, label: b.label }))}
          shownDepts={shownDepts}
          onToggleDept={(id, on) => setView({ depts: on ? BANDS.map((x) => x.id).filter((x) => x === id || shownDepts.includes(x)) : shownDepts.filter((x) => x !== id) })}
        />
        <DisplayMenu view={view} setView={setView} />
        {phone ? (
          <button type="button" className={toolbarButton} onClick={() => setPhoneFilters((v) => !v)} aria-pressed={phoneFilters}>
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
        ) : null}
        {!full ? (
          <button type="button" className={toolbarButton} onClick={() => setFull(true)} title="Full screen (Esc to leave)">
            Full screen
          </button>
        ) : null}
        <button type="button" className={`${toolbarButton} sm:hidden`} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          {moreOpen ? 'Fewer' : 'More'}
        </button>
        <span className={`${moreOpen ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 sm:ml-auto sm:flex sm:w-auto`}>
          <button type="button" className={toolbarButton} onClick={() => void list.refetch()} disabled={list.isFetching} title="Reload the items">
            {list.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className={toolbarButton} onClick={() => void copyRows(selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows)} disabled={rows.length === 0} title="Copy as tab-separated text, ready to paste into Excel">
            {selected.size > 0 ? `Copy ${selected.size} selected` : 'Copy this page'}
          </button>
          <ExportMenu exporting={exporting} selected={selected.size} total={data?.total ?? 0} onExport={(k, s) => void exportRows(k, s)} />
        </span>
      </div>

      {activeFilters > 0 || sort ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters and sort">
          {Object.entries(filters)
            .filter(([, v]) => v)
            .map(([param, v]) => (
              <span key={param} className="inline-flex max-w-[260px] items-center overflow-hidden rounded-full border border-line-strong bg-surface text-[12px] text-ink-2">
                <span className="truncate pl-2.5">
                  <span className="font-semibold">{paramInfo.get(param)?.label ?? param}</span>: {chipValue(param, v)}
                </span>
                <button type="button" aria-label={`Remove filter ${paramInfo.get(param)?.label ?? param}`} onClick={() => setFilters((prev) => ({ ...prev, [param]: '' }))} className="h-6 w-6 cursor-pointer border-0 bg-transparent text-ink-3 hover:text-danger">
                  ×
                </button>
              </span>
            ))}
          {sort ? (
            <span className="inline-flex items-center overflow-hidden rounded-full border border-line-strong bg-surface text-[12px] text-ink-2">
              <span className="pl-2.5">
                Sorted by <span className="font-semibold">{MASTER_COLUMNS.find((c) => c.id === sort)?.label ?? sort}</span> {view.dir === 'asc' ? 'A → Z' : 'Z → A'}
              </span>
              <button type="button" aria-label="Clear sort" onClick={() => setView({ sort: '', dir: 'asc' })} className="h-6 w-6 cursor-pointer border-0 bg-transparent text-ink-3 hover:text-danger">
                ×
              </button>
            </span>
          ) : null}
          {activeFilters > 0 ? (
            <button type="button" onClick={() => setFilters({})} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent">
              Clear all filters
            </button>
          ) : null}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-accent-soft px-3 py-1.5 text-[12.5px] text-ink-2" role="status">
          <span className="font-semibold tabular-nums">{selected.size} selected</span>
          <button type="button" onClick={() => setSelected(new Set())} className="cursor-pointer border-0 bg-transparent p-0 text-accent">
            Clear selection
          </button>
        </div>
      ) : null}

      {list.isError ? (
        <Panel>
          <ErrorState message={list.error instanceof ApiRequestError ? list.error.message : "Couldn't load the items."} onRetry={() => void list.refetch()} />
        </Panel>
      ) : (
        <Panel className={`relative flex min-h-0 flex-col overflow-hidden ${full ? 'flex-1' : ''}`}>
          {list.isFetching && !list.isPending ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface/60" role="status" aria-live="polite">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-control">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden="true" />
                Loading…
              </span>
            </div>
          ) : null}
          <div className={`overflow-auto overscroll-contain ${full ? 'min-h-0 flex-1' : 'max-h-[calc(100dvh-236px)]'}`}>
            <table className="min-w-full border-separate border-spacing-0 text-[12.5px] text-ink-2">
              <thead>
                <tr>
                  <th colSpan={lead} style={{ left: 0 }} className={`sticky ${headTop[0]} z-30 h-7 border-b border-line-soft bg-surface-sunken`} />
                  {bands.map((b, i) => (
                    <th key={`${b.id}-${i}`} colSpan={b.span} className={`sticky ${headTop[0]} z-20 h-7 border-b border-l border-line-soft bg-surface-sunken px-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3`}>
                      {b.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th style={{ left: 0, width: SELECT_W, minWidth: SELECT_W }} className={`sticky ${headTop[1]} z-30 h-9 border-b border-line-soft bg-surface px-2 text-center`}>
                    <input ref={allBox} type="checkbox" aria-label="Select every row on this page" className="h-4 w-4 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                  </th>
                  {phone ? null : (
                    <th style={{ left: SELECT_W, width: NUM_W, minWidth: NUM_W }} className={`sticky ${headTop[1]} z-30 h-9 border-b border-line-soft bg-surface px-2 text-right text-[11px] font-semibold text-ink-4`} aria-label="Row number">
                      #
                    </th>
                  )}
                  {columns.map((c, i) => {
                    const pinned = pinLeft.has(c.id);
                    const sortable = SORTABLE.has(c.id);
                    const dir = sort === c.id ? view.dir : null;
                    const fixed = pinned || view.widths[c.id] !== undefined;
                    const w = widthOf(c);
                    return (
                      <th
                        key={c.id}
                        aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                        style={{ ...(fixed ? { width: w, minWidth: w, maxWidth: w } : { minWidth: c.width }), ...(pinned ? { left: pinLeft.get(c.id) } : {}) }}
                        className={`sticky ${headTop[1]} ${pinned ? 'z-30' : 'z-20'} h-9 border-b border-r border-line-soft bg-surface-sunken px-2 text-left text-[12px] font-semibold text-ink-2`}
                        title={c.hint}
                      >
                        <div className="flex min-w-0 items-center gap-0.5">
                          {sortable ? (
                            <button type="button" onClick={() => cycleSort(c.id)} className="flex min-w-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-[12px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
                              <span className="truncate">{c.label}</span>
                              <span aria-hidden className="text-[10px] text-accent">{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}</span>
                            </button>
                          ) : (
                            <span className="truncate">{c.label}</span>
                          )}
                          <span className="ml-auto shrink-0">
                            <HeaderMenu
                              column={c}
                              sortable={sortable}
                              sorted={dir}
                              pinned={pinned}
                              canMoveLeft={i > 0 && pinned === pinLeft.has(columns[i - 1]!.id)}
                              canMoveRight={i < columns.length - 1 && pinned === pinLeft.has(columns[i + 1]!.id)}
                              actions={{
                                sort: (d) => setView(d ? { sort: c.id, dir: d } : { sort: '', dir: 'asc' }),
                                hide: () => setView((v) => ({ hidden: [...v.hidden, c.id] })),
                                showOnly: () => setView({ hidden: baseColumns.filter((x) => x.id !== c.id).map((x) => x.id) }),
                                pin: () => setView((v) => ({ pinned: v.pinned.includes(c.id) ? v.pinned.filter((x) => x !== c.id) : [...v.pinned, c.id] })),
                                move: (step) => setView((v) => ({ order: moveColumn(baseColumns, v, c.id, step) })),
                                resetWidth: () => setView((v) => ({ widths: Object.fromEntries(Object.entries(v.widths).filter(([k]) => k !== c.id)) })),
                              }}
                            />
                          </span>
                        </div>
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${c.label}`}
                          title="Drag to resize, double-click to reset"
                          onPointerDown={(e) => startResize(e, c)}
                          onDoubleClick={() => setView((v) => ({ widths: Object.fromEntries(Object.entries(v.widths).filter(([k]) => k !== c.id)) }))}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-accent/40 [@media(pointer:coarse)]:w-3"
                        />
                      </th>
                    );
                  })}
                </tr>
                {filterRowOn ? (
                  <tr>
                    <th style={{ left: 0 }} colSpan={lead} className={`sticky ${headTop[2]} z-30 border-b border-line bg-surface`} />
                    {columns.map((c) => (
                      <th key={c.id} style={pinLeft.has(c.id) ? { left: pinLeft.get(c.id) } : undefined} className={`sticky ${headTop[2]} ${pinLeft.has(c.id) ? 'z-30' : 'z-20'} border-b border-line bg-surface px-1.5 py-1 font-normal`}>
                        <FilterCell
                          filter={MASTER_FILTERS[c.id]}
                          value={filters[MASTER_FILTERS[c.id]?.param ?? ''] ?? ''}
                          onChange={(v) => {
                            const f = MASTER_FILTERS[c.id];
                            if (f) setFilters((prev) => ({ ...prev, [f.param]: v }));
                          }}
                          options={MASTER_FILTERS[c.id] ? optionsFor(MASTER_FILTERS[c.id]!) : []}
                          label={c.label}
                        />
                      </th>
                    ))}
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {list.isPending
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={columns.length + lead} className="px-2 py-1.5">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row, ri) => {
                      const isSel = selected.has(row.id);
                      const rowBg = isSel ? 'bg-accent-soft' : 'bg-surface';
                      const hov = isSel ? '' : 'group-hover:bg-surface-sunken';
                      return (
                        <tr key={row.id} className="group">
                          <td style={{ left: 0, width: SELECT_W, minWidth: SELECT_W }} className={`sticky z-10 border-b border-line-soft px-0 text-center align-middle ${hov} ${rowBg}`}>
                            <label className="-my-2 flex h-10 w-full cursor-pointer touch-manipulation items-center justify-center">
                              <input type="checkbox" aria-label={`Select ${row.code}`} className="h-4 w-4 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" checked={isSel} onChange={() => toggleRow(row.id)} />
                            </label>
                          </td>
                          {phone ? null : (
                            <td style={{ left: SELECT_W, width: NUM_W, minWidth: NUM_W }} className={`sticky z-10 border-b border-line-soft px-2 text-right align-middle text-[11px] tabular-nums text-ink-4 ${hov} ${rowBg}`}>
                              {first + ri + 1}
                            </td>
                          )}
                          {columns.map((c) => {
                            const pinned = pinLeft.has(c.id);
                            const fixed = pinned || view.widths[c.id] !== undefined;
                            const w = widthOf(c);
                            return (
                              <td
                                key={c.id}
                                style={{ ...(fixed ? { width: w, minWidth: w, maxWidth: w } : {}), ...(pinned ? { left: pinLeft.get(c.id) } : {}) }}
                                className={`border-b border-r border-line-soft px-2 align-middle tabular-nums ${hov} ${ROW_PADDING[view.density]} ${pinned ? `sticky z-10 ${rowBg}` : isSel ? 'bg-accent-soft' : ''} ${view.wrap ? 'whitespace-normal break-words' : 'truncate whitespace-nowrap'} ${fixed ? '' : 'max-w-[320px]'}`}
                              >
                                {cell(row, c)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                {data && rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + lead} className="px-3 py-8 text-center text-ink-3">
                      No items match these filters.
                      {activeFilters > 0 ? (
                        <>
                          {' '}
                          <button type="button" onClick={() => setFilters({})} className="cursor-pointer border-0 bg-transparent p-0 text-accent underline">
                            Clear filters
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {data && data.total > 0 ? (
            <Pagination
              page={page}
              totalPages={totalPagesOf(data.total, pageSize)}
              total={data.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              label="items"
            />
          ) : null}
        </Panel>
      )}
    </div>
  );
}
