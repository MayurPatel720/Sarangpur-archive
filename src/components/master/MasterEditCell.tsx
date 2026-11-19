'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { parseDateRange } from '@/lib/date-range';
import { cellText } from '@/lib/item-cells';
import { shownOnSheet, type ColumnSpec } from '@/lib/item-columns';
import { queryKeys } from '@/lib/query-keys';
import { MAX_RECHECK_WEEKS } from '@/lib/recheck';
import { refOptions, type RefLists } from '@/lib/ref-lists';
import { useToast } from '@/components/ui/Toast';
import type { ItemsBulkSet } from '@/types/items';
import type { MasterRow } from '@/types/master';

/** The columns this cell edits. Everything else keeps its own cell (codes, decisions, file path, photos, status). */
export const MASTER_EDITABLE_KINDS = new Set<ColumnSpec['kind']>(['text', 'longtext', 'date', 'dateRange', 'number', 'weeks', 'ref', 'yesno', 'flag', 'disposition']);

export const isMasterEditable = (c: ColumnSpec): boolean =>
  c.dept !== 'lot' && c.dept !== 'custom' && c.dept !== 'decision' && MASTER_EDITABLE_KINDS.has(c.kind) && !c.viaDialog && Boolean(c.field || c.attr) && c.id !== 'fileName';

const triText = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '');

/** The stored value of a cell, in the form a dropdown holds it. */
function rawOf(row: MasterRow, c: ColumnSpec): unknown {
  if (c.attr) return row.attrs[c.id];
  return (row as unknown as Record<string, unknown>)[c.field ?? c.id];
}

/**
 * An editable cell of the Master Excel for a lot's own columns. It saves through the lot's items endpoint, so the
 * lot's own rules apply (a locked lot says so, the change lands in the lot's version history). Click to edit,
 * Enter or leaving the cell saves, Escape cancels.
 */
export function MasterEditCell({ row, spec, lists, refLabel }: { row: MasterRow; spec: ColumnSpec; lists: RefLists; refLabel: (list: string, v: string | null) => string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [override, setOverride] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const current = cellText(row, spec, refLabel);
  const shown = override ?? current;

  const save = useMutation({
    mutationFn: (v: { value: unknown; show: string }) => {
      const set: Record<string, unknown> = spec.attr ? { attrs: { [spec.id]: v.value } } : { [spec.field!]: v.value };
      return itemsGridApi.update(row.lotId, { itemIds: [row.id], set: set as ItemsBulkSet });
    },
    onSuccess: (_r, v) => {
      setOverride(v.show);
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(row.lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.history(row.lotId) });
    },
    onError: (e) => {
      setOverride(null);
      toast.error(`Could not save ${spec.label}`, e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  if (!shownOnSheet(spec, row.format)) return <span className="text-ink-4">—</span>;

  /** Typed text → the value to save, or an error. */
  const parse = (text: string): { ok: true; value: unknown } | { ok: false; error: string } => {
    if (text === '') return { ok: true, value: null };
    switch (spec.kind) {
      case 'date':
      case 'dateRange': {
        const r = parseDateRange(text);
        return r.ok ? { ok: true, value: text } : { ok: false, error: r.error };
      }
      case 'number': {
        const n = Number(text.replace(/,/g, ''));
        return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Must be a number.' };
      }
      case 'weeks': {
        const n = Number(text);
        return Number.isInteger(n) && n >= 1 && n <= MAX_RECHECK_WEEKS ? { ok: true, value: n } : { ok: false, error: `Use a whole number of weeks (1–${MAX_RECHECK_WEEKS}).` };
      }
      default:
        return { ok: true, value: text };
    }
  };

  const commit = (raw: string) => {
    const next = raw.trim();
    setEditing(false);
    if (next === shown) return;
    const r = parse(next);
    if (!r.ok) {
      toast.error(spec.label, r.error);
      return;
    }
    save.mutate({ value: r.value, show: next });
  };

  const selectClass = 'h-7 w-full min-w-0 cursor-pointer rounded-[4px] border border-transparent bg-transparent px-1 text-[12.5px] hover:border-line focus:border-accent';

  if (spec.kind === 'yesno' || spec.kind === 'flag' || spec.kind === 'disposition') {
    const options =
      spec.kind === 'disposition'
        ? [{ v: '', l: '—' }, { v: 'return', l: 'Return' }, { v: 'discard', l: 'Discard' }]
        : [{ v: '', l: '—' }, { v: 'Yes', l: 'Yes' }, { v: 'No', l: 'No' }];
    const raw = rawOf(row, spec);
    const value = override !== null ? override : spec.kind === 'disposition' ? String(raw ?? '') : triText(raw);
    return (
      <select
        value={value}
        disabled={save.isPending}
        aria-label={`${spec.label} for ${row.code}`}
        onChange={(e) => {
          const t = e.target.value;
          const v = spec.kind === 'disposition' ? (t === '' ? null : t) : t === 'Yes' ? true : t === 'No' ? (spec.kind === 'flag' ? false : false) : null;
          save.mutate({ value: v, show: t });
        }}
        className={`${selectClass} ${value ? 'text-ink' : 'text-ink-4'}`}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    );
  }

  if (spec.kind === 'ref') {
    const parent = spec.refParent?.column;
    const opts = refOptions(spec, lists, parent ? row.attrs[parent] : undefined);
    const raw = override !== null ? override : String(rawOf(row, spec) ?? '');
    return (
      <select
        value={raw}
        disabled={save.isPending}
        aria-label={`${spec.label} for ${row.code}`}
        onChange={(e) => save.mutate({ value: e.target.value === '' ? null : e.target.value, show: e.target.value })}
        className={`${selectClass} ${raw ? 'text-ink' : 'text-ink-4'}`}
      >
        <option value="">—</option>
        {raw && !opts.some((o) => o.value === raw) ? <option value={raw}>{refLabel(spec.refList ?? '', raw)}</option> : null}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
          else if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(false);
          }
        }}
        name={`edit-${spec.id}`}
        autoComplete="off"
        inputMode={spec.kind === 'number' || spec.kind === 'weeks' ? 'numeric' : undefined}
        aria-label={`${spec.label} of ${row.code}`}
        className="h-8 w-full min-w-[120px] rounded-[4px] border border-accent bg-surface px-2 text-[12.5px] text-ink"
      />
    );
  }
  const start = () => {
    setDraft(shown);
    setEditing(true);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${spec.label} of ${row.code}: ${shown || 'empty'}. Press Enter to edit.`}
      title="Click to edit"
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          start();
        }
      }}
      className={`block min-h-[24px] w-full cursor-text truncate rounded-[4px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${save.isPending ? 'opacity-60' : ''}`}
    >
      {shown || <span className="text-ink-4">—</span>}
    </span>
  );
}
