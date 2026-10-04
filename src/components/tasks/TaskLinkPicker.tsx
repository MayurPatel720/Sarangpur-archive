'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lotsApi, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { date } from '@/lib/format';
import { GhostButton, TextInput } from '@/components/ui/Form';

export interface TaskLink {
  id: string;
  code: string;
  /** Lots only: the format the task will inherit. */
  format?: string;
}

interface Option extends TaskLink {
  title: string;
  detail: string;
}

const PAGE_SIZE = 10;

/**
 * Optional link to a lot or a project. Opening the box lists the newest ten; typing
 * narrows it server-side (lots by code, owner or any other register term; projects by
 * code or name). A chip shows the choice once one is picked.
 */
export function TaskLinkPicker({
  kind,
  value,
  onChange,
}: {
  kind: 'lot' | 'project';
  value: TaskLink | null;
  onChange: (next: TaskLink | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const active = open && !value;
  const lots = useQuery({
    queryKey: queryKeys.lots.list(JSON.stringify({ picker: true, q: debounced })),
    queryFn: () =>
      lotsApi.list({ ...(debounced ? { q: debounced } : {}), sort: '-dateReceived', pageSize: String(PAGE_SIZE), page: '1' }),
    enabled: kind === 'lot' && active,
  });
  const projects = useQuery({
    queryKey: queryKeys.projects.list(JSON.stringify({ picker: true, q: debounced })),
    queryFn: () => projectsApi.list(1, PAGE_SIZE, debounced || undefined),
    enabled: kind === 'project' && active,
  });

  if (value) {
    return (
      <div className="flex items-center gap-2 min-h-10">
        <span className="font-mono text-[13px] font-semibold text-ink">{value.code}</span>
        <GhostButton type="button" className="h-8 !px-2.5 text-[12px]" onClick={() => onChange(null)}>
          Remove
        </GhostButton>
      </div>
    );
  }

  const options: Option[] =
    kind === 'lot'
      ? (lots.data?.rows ?? []).map((r) => ({
          id: r.id,
          code: r.namingCode ?? r.lotReference,
          format: r.format,
          title: r.ownerName || '—',
          detail: [r.format, r.dateReceived ? date(r.dateReceived) : null].filter(Boolean).join(' · '),
        }))
      : (projects.data?.rows ?? []).map((r) => ({
          id: r.id,
          code: r.code,
          title: r.name,
          detail: `${r.lotCount} ${r.lotCount === 1 ? 'lot' : 'lots'}`,
        }));
  const loading = kind === 'lot' ? lots.isFetching : projects.isFetching;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <TextInput
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={kind === 'lot' ? 'Search lot code or owner…' : 'Search project name or code…'}
        aria-label={kind === 'lot' ? 'Search lots' : 'Search projects'}
        autoComplete="off"
      />
      {active ? (
        <ul className="m-0 p-0 list-none border border-line rounded-[6px] overflow-y-auto max-h-[260px] bg-surface">
          {options.map((o) => (
            <li key={o.id} className="border-b border-line-row last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  onChange(o);
                  setSearch('');
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 bg-surface hover:bg-surface-sunken border-0 cursor-pointer flex flex-col gap-0.5"
              >
                <span className="text-[12.5px] text-ink truncate">
                  <span className="font-mono font-semibold">{o.code}</span>
                  <span className="text-ink-3"> · </span>
                  <span>{o.title}</span>
                </span>
                {o.detail ? <span className="text-[11.5px] text-ink-3 truncate">{o.detail}</span> : null}
              </button>
            </li>
          ))}
          {options.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-ink-3">{loading ? 'Loading…' : 'No matches.'}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
