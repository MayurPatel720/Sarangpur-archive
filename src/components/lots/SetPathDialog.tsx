'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { cleanPath, joinPath, loadBaseFolder, readDrop, saveBaseFolder } from '@/lib/file-path';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem } from '@/types/items';

/** The File path column's header in an import: "<department>|<column name>". */
const PATH_CELL = 'Digitalization & Storage|File path';

/**
 * "Set path for all": one parent folder for the lot's rows. The same path on every row, or the parent
 * folder plus each item's archive code. Pasting the folder gives its full path; dropping a folder gives
 * only its name (browsers hide the location), which is added to the base folder remembered here.
 */
export function SetPathDialog({
  lotId,
  items,
  selectedIds,
  onClose,
  onDone,
}: {
  lotId: string;
  /** Rows that have a File path column. */
  items: GridItem[];
  selectedIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [parent, setParent] = useState('');
  const [base, setBase] = useState(() => loadBaseFolder());
  const [rememberBase, setRememberBase] = useState(false);
  const [addCode, setAddCode] = useState(false);
  const [scope, setScope] = useState<'all' | 'selected'>(selectedIds.length > 0 ? 'selected' : 'all');
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const targets = useMemo(() => {
    const ids = new Set(selectedIds);
    return items.filter((i) => (scope === 'all' || ids.has(i.id)) && (!onlyEmpty || !i.fileName));
  }, [items, selectedIds, scope, onlyEmpty]);

  const folder = cleanPath(parent);
  const pathFor = (i: GridItem) => (addCode ? joinPath(folder, i.code) : folder);

  const apply = useMutation({
    mutationFn: () =>
      itemsGridApi.importRows(lotId, { apply: true, rows: targets.map((i) => ({ code: i.code, cells: { [PATH_CELL]: pathFor(i) } })) }),
    onSuccess: (res) => {
      if (rememberBase && folder) saveBaseFolder(folder);
      toast.success('Path set', `${res.willChange} ${res.willChange === 1 ? 'row' : 'rows'} updated.`);
      onDone();
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not set the path.'),
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const d = readDrop(e.dataTransfer, base);
    if (d.path) {
      setParent(d.path);
      setError(null);
    } else if (d.name) {
      setParent(d.name);
      setError('The browser only shared the folder name. Paste the full path here, or save a base folder below.');
    }
  };

  return (
    <Dialog title="Set path for all" subtitle="Fill the File path column from one parent folder." onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!folder || targets.length === 0) return;
          setError(null);
          apply.mutate();
        }}
      >
        <Field label="Parent folder" required>
          <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop} className={`rounded-[8px] ${over ? 'ring-2 ring-accent' : ''}`}>
            <TextInput
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              onBlur={() => setParent((p) => cleanPath(p))}
              name="parentFolder"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste or drop the folder, like D:\Archive\2026…"
              aria-label="Parent folder"
            />
          </div>
        </Field>

        <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={addCode} onChange={(e) => setAddCode(e.target.checked)} />
          Add each item's archive code as the last part of its path
        </label>

        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 p-0 text-[12px] font-semibold text-ink-2">Which rows</legend>
          <label className="flex min-h-[30px] cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="radio" name="scope" className="h-4 w-4 accent-accent" checked={scope === 'all'} onChange={() => setScope('all')} />
            Every row in this lot ({items.length})
          </label>
          <label className="flex min-h-[30px] cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="radio" name="scope" className="h-4 w-4 accent-accent" checked={scope === 'selected'} disabled={selectedIds.length === 0} onChange={() => setScope('selected')} />
            Only the ticked rows ({selectedIds.length})
          </label>
          <label className="flex min-h-[30px] cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
            Leave rows that already have a path alone
          </label>
        </fieldset>

        <label className="flex min-h-[30px] cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={rememberBase} onChange={(e) => setRememberBase(e.target.checked)} />
          Remember this folder as my base folder (used when a folder is dropped into a cell)
          {base ? <span className="text-[12px] text-ink-3">Now: {base}</span> : null}
        </label>

        {folder && targets.length > 0 ? (
          <p className="m-0 break-all rounded-[6px] bg-surface-sunken px-3 py-2 text-[12px] text-ink-2">
            {targets.length} {targets.length === 1 ? 'row' : 'rows'} will get, for example: <span className="font-mono">{pathFor(targets[0]!)}</span>
          </p>
        ) : folder ? (
          <p className="m-0 text-[12.5px] text-ink-3">No rows to change with these choices.</p>
        ) : null}

        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={apply.isPending || !folder || targets.length === 0}>
            {apply.isPending ? 'Saving…' : `Set path on ${targets.length} ${targets.length === 1 ? 'row' : 'rows'}`}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
