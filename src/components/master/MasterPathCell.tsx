'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cleanPath, loadBaseFolder, readDrop } from '@/lib/file-path';
import { useToast } from '@/components/ui/Toast';
import { LocateFolderDialog } from '@/components/lots/LocateFolderDialog';
import type { MasterRow } from '@/types/master';

/**
 * The File path cell of the Master Excel. Everything else in this sheet is read only, but a file path is
 * pasted in long after intake, so this one cell takes it right here: click and type or paste, paste onto
 * the focused cell, or drop a path / file / folder on it. The save goes through the same items endpoint as
 * the lot's own Excel, so the lot's rules apply (a locked lot or one you may not edit says so).
 */
export function MasterPathCell({ row }: { row: MasterRow }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [over, setOver] = useState(false);
  const [locate, setLocate] = useState<string | null>(null);
  const cell = useRef<HTMLSpanElement>(null);

  const shown = value ?? row.fileName ?? '';

  const save = useMutation({
    mutationFn: (path: string) => itemsGridApi.update(row.lotId, { itemIds: [row.id], set: { fileName: path || null } }),
    onSuccess: (_res, path) => {
      setValue(path);
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
      toast.success('Path saved', path || 'Cleared.');
    },
    onError: (e) => {
      toast.error('Could not save the path', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  const commit = (raw: string) => {
    const next = cleanPath(raw);
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
        name="file-path"
        autoComplete="off"
        spellCheck={false}
        aria-label={`File path of ${row.code}`}
        placeholder="Paste or type the full path…"
        className="h-8 w-full min-w-[220px] rounded-[4px] border border-accent bg-surface px-2 text-[12.5px] text-ink"
      />
    );
  }

  return (
    <>
      <span
        ref={cell}
        role="button"
        tabIndex={0}
        aria-label={`File path of ${row.code}: ${shown || 'empty'}. Press Enter to edit, or paste a path.`}
        title="Click to edit. Paste or drop a path, file or folder here."
        data-over={over}
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
        onPaste={(e) => {
          const text = cleanPath(e.clipboardData.getData('text/plain'));
          if (!text) return;
          e.preventDefault();
          commit(text);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const d = readDrop(e.dataTransfer, loadBaseFolder());
          if (d.path) commit(d.path);
          else if (d.name) setLocate(d.name);
        }}
        className={`block min-h-[24px] w-full cursor-text truncate rounded-[4px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[over=true]:bg-accent-soft data-[over=true]:ring-2 data-[over=true]:ring-accent ${save.isPending ? 'opacity-60' : ''}`}
      >
        {shown || <span className="text-ink-4">Paste or drop a path…</span>}
      </span>
      {locate ? <LocateFolderDialog name={locate} onDone={commit} onClose={() => setLocate(null)} /> : null}
    </>
  );
}
