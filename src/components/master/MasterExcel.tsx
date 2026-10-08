'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiRequestError, masterApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useFormatContext } from '@/hooks/useFormatParam';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { GhostButton } from '@/components/ui/Form';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { cellText } from '@/lib/item-cells';
import { DEPARTMENTS, deptLabel, type ColumnSpec } from '@/lib/item-columns';
import { MASTER_COLUMNS, MASTER_FILTERS, type MasterFilter } from '@/lib/master-columns';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { num } from '@/lib/format';
import type { MasterRow } from '@/types/master';
import { buildItemsWorkbook } from '@/components/lots/excel-io';

/**
 * The Master Excel: every item of every lot (and its project) in one sheet. Filter row under the
 * column names (type to filter, picks for the dropdowns), server-side paging, department tick
 * boxes to show / hide column groups, and Export of everything that matches the filters.
 * Read only — items are edited in their own lot's Excel (click a lot no or archive code).
 */

const BANDS = [{ id: 'lot', label: 'Lot' }, ...DEPARTMENTS] as const;
type BandId = (typeof BANDS)[number]['id'];
const EXPORT_CAP = 20_000;
const EXPORT_PAGE = 200;

const inputCls =
  'h-7 w-full min-w-0 rounded-[4px] border border-line bg-surface px-1.5 text-[12px] text-ink placeholder:text-ink-4';

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
  if (filter.type === 'text') {
    return (
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter"
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

export function MasterExcel() {
  const toast = useToast();
  const format = useFormatContext();
  const stages = useReferenceList('stage');
  const dataTypes = useReferenceList('dataType');
  const sources = useReferenceList('physicalSource');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [shown, setShown] = useState<BandId[]>(() => BANDS.map((b) => b.id));
  const [exporting, setExporting] = useState(false);

  // Filters apply after a short pause in typing, from page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);
  useEffect(() => setPage(1), [format]);

  const optionsFor = (f: MasterFilter): { value: string; label: string }[] => {
    if (f.type !== 'select') return [];
    if (f.options === 'stage') return (stages.data?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    if (f.options === 'dataType') return (dataTypes.data?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    if (f.options === 'physicalSource') return (sources.data?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    return f.options;
  };
  const refLabel = useCallback(
    (_list: string, v: string | null) => (v ? (sources.data?.items.find((i) => i.value === v)?.label ?? v) : ''),
    [sources.data],
  );

  const params = useMemo(() => {
    const p: Record<string, string | number | undefined> = { ...applied, format, page, pageSize };
    return p;
  }, [applied, format, page, pageSize]);
  const key = JSON.stringify(params);
  const list = useQuery({
    queryKey: queryKeys.master.list(key),
    queryFn: () => masterApi.list(params),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(() => MASTER_COLUMNS.filter((c) => shown.includes(c.dept as BandId)), [shown]);
  const bands = useMemo(() => {
    const out: { id: string; label: string; span: number }[] = [];
    for (const c of columns) {
      const last = out[out.length - 1];
      if (last && last.id === c.dept) last.span += 1;
      else out.push({ id: c.dept, label: deptLabel(c.dept), span: 1 });
    }
    return out;
  }, [columns]);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const data = list.data;

  const exportAll = async () => {
    setExporting(true);
    try {
      const rows: MasterRow[] = [];
      for (let p = 1; rows.length < EXPORT_CAP; p += 1) {
        const res = await masterApi.list({ ...applied, format, page: p, pageSize: EXPORT_PAGE });
        rows.push(...res.rows);
        if (rows.length >= res.total || res.rows.length === 0) break;
      }
      if (rows.length === 0) {
        toast.info('Nothing to export', 'No items match the filters.');
        return;
      }
      const wb = await buildItemsWorkbook({ sheets: [{ name: 'Master', rows }], columns, refLabel });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `master-excel${format ? `-${format}` : ''}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Exported', `${num(rows.length)} items${data && rows.length < data.total ? ` (first ${num(EXPORT_CAP)})` : ''}.`);
    } catch (e) {
      toast.error('Could not export', e instanceof ApiRequestError ? e.message : undefined);
    } finally {
      setExporting(false);
    }
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
    return text || <span className="text-ink-4">—</span>;
  };

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="m-0 text-[18px] font-semibold tracking-[-0.015em] text-ink">
          Master Excel{format ? ` · ${FORMAT_LABELS[format as Format]}` : ''}
        </h1>
        <span className="text-[12.5px] text-ink-3 tabular-nums">
          {data ? `${num(data.total)} ${data.total === 1 ? 'item' : 'items'}` : ''}
        </span>
        <div role="group" aria-label="Departments" className="flex flex-wrap gap-x-3 text-[12px] text-ink-2 sm:ml-auto">
          {BANDS.map((b) => (
            <label key={b.id} className="flex items-center gap-1.5 min-h-[32px] cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={shown.includes(b.id)}
                onChange={(e) =>
                  setShown((prev) => (e.target.checked ? BANDS.map((x) => x.id).filter((x) => x === b.id || prev.includes(x)) : prev.filter((x) => x !== b.id)))
                }
              />
              {b.label}
            </label>
          ))}
        </div>
        {activeFilters > 0 ? (
          <GhostButton onClick={() => setFilters({})}>Clear filters ({activeFilters})</GhostButton>
        ) : null}
        <GhostButton onClick={() => void exportAll()} disabled={exporting || !data || data.total === 0}>
          {exporting ? 'Exporting…' : 'Export'}
        </GhostButton>
      </div>

      {list.isError ? (
        <Panel>
          <ErrorState
            message={list.error instanceof ApiRequestError ? list.error.message : "Couldn't load the items."}
            onRetry={() => void list.refetch()}
          />
        </Panel>
      ) : (
        <Panel className="min-h-0 flex flex-col overflow-hidden">
          <div className="overflow-auto max-h-[calc(100dvh-250px)]">
            <table className="border-separate border-spacing-0 text-[12.5px] text-ink-2 min-w-full">
              <thead>
                <tr>
                  {bands.map((b) => (
                    <th
                      key={b.id}
                      colSpan={b.span}
                      className="sticky top-0 z-20 h-7 bg-surface-sunken border-b border-l border-line-soft px-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3"
                    >
                      {b.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.id}
                      style={{ minWidth: c.width }}
                      className="sticky top-7 z-20 h-9 bg-surface border-b border-line-soft px-2 text-left text-[12px] font-semibold text-ink-3 whitespace-nowrap"
                      title={c.hint}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {columns.map((c) => (
                    <th key={c.id} className="sticky top-16 z-20 bg-surface border-b border-line px-1.5 py-1 font-normal">
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
              </thead>
              <tbody>
                {list.isPending
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={columns.length} className="px-2 py-1.5">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  : (data?.rows ?? []).map((row) => (
                      <tr key={row.id} className="hover:bg-accent-soft">
                        {columns.map((c) => (
                          <td key={c.id} className="border-b border-line-soft px-2 py-1.5 whitespace-nowrap max-w-[320px] truncate">
                            {cell(row, c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                {data && data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 py-8 text-center text-ink-3">
                      No items match these filters.
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
