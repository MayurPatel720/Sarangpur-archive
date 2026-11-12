'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/ui/Toast';
import type { MasterRow } from '@/types/master';

/**
 * A free-text custom column of the Master Excel: click, type, Enter. Saved on the item through the lot's
 * items endpoint, so the lot's rules apply (a locked lot, or one you may not edit, says so).
 */
export function MasterCustomCell({ row, colKey, label }: { row: MasterRow; colKey: string; label: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const shown = value ?? row.extra[colKey] ?? '';

  const save = useMutation({
    mutationFn: (text: string) => itemsGridApi.update(row.lotId, { itemIds: [row.id], set: { masterCustom: { [colKey]: text || null } } }),
    onSuccess: (_res, text) => {
      setValue(text);
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
    },
    onError: (e) => toast.error(`Could not save ${label}`, e instanceof ApiRequestError ? e.message : undefined),
  });

  const commit = (raw: string) => {
    const next = raw.trim();
    setEditing(false);
    if (next === shown) return;
    save.mutate(next);
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
        name={`master-custom-${colKey}`}
        autoComplete="off"
        aria-label={`${label} of ${row.code}`}
        className="h-8 w-full min-w-[120px] rounded-[4px] border border-accent bg-surface px-2 text-[12.5px] text-ink"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${label} of ${row.code}: ${shown || 'empty'}. Press Enter to edit.`}
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
      {shown || <span className="text-ink-4">Type…</span>}
    </span>
  );
}
