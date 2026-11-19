'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/ui/Toast';
import type { MasterRow } from '@/types/master';

type YesNoField = 'digital' | 'redigital' | 'discard';

const toText = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '');
const fromText = (t: string): boolean | null => (t === 'Yes' ? true : t === 'No' ? false : null);

/**
 * A Decision cell of the Master Excel (Digital · Redigital · Discard · Decision remark). It saves through the lot's
 * items endpoint, so the lot's rules apply: a lot whose decision is recorded is locked (the toast says so), and
 * deciding the last item decides the lot — exactly as in the lot's own Excel. Prasadi items have no Decision.
 */
export function MasterDecisionCell({ row, field }: { row: MasterRow; field: YesNoField | 'decisionRemark' }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const current = field === 'decisionRemark' ? (row.decisionRemark ?? '') : toText(row[field]);
  const shown = value ?? current;

  const save = useMutation({
    mutationFn: (v: { set: Record<string, unknown>; show: string }) => itemsGridApi.update(row.lotId, { itemIds: [row.id], set: v.set }),
    onSuccess: (res, v) => {
      setValue(v.show);
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(row.lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.history(row.lotId) });
      if (res.finalized) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
        toast.success('Lot decided from its items', `Moved to ${res.finalized.stage}.`);
      }
    },
    onError: (e) => {
      setValue(null);
      toast.error('Could not save the decision', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  if (row.format === 'prasadi') return <span className="text-ink-4">—</span>;

  if (field === 'decisionRemark') {
    const commit = (raw: string) => {
      const next = raw.trim();
      setEditing(false);
      if (next === shown) return;
      save.mutate({ set: { decisionRemark: next || null }, show: next });
    };
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
          name="decision-remark"
          autoComplete="off"
          aria-label={`Decision remark of ${row.code}`}
          className="h-8 w-full min-w-[120px] rounded-[4px] border border-accent bg-surface px-2 text-[12.5px] text-ink"
        />
      );
    }
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={`Decision remark of ${row.code}: ${shown || 'empty'}. Press Enter to edit.`}
        title="Click to type"
        onClick={() => {
          setDraft(shown);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault();
            setDraft(shown);
            setEditing(true);
          }
        }}
        className={`block min-h-[24px] w-full cursor-text truncate rounded-[4px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${save.isPending ? 'opacity-60' : ''}`}
      >
        {shown || <span className="text-ink-4">—</span>}
      </span>
    );
  }

  return (
    <select
      value={shown}
      disabled={save.isPending}
      aria-label={`${field} for ${row.code}`}
      onChange={(e) => save.mutate({ set: { [field]: fromText(e.target.value) }, show: e.target.value })}
      className={`h-7 w-full min-w-0 cursor-pointer rounded-[4px] border border-transparent bg-transparent px-1 text-[12.5px] hover:border-line focus:border-accent ${
        shown === 'Yes' ? 'font-semibold text-good-mark' : shown === 'No' ? 'text-ink-2' : 'text-ink-4'
      }`}
    >
      <option value="">—</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  );
}
