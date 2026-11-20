'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { isPendingCode } from '@/lib/domain';
import { letterCodeError, letterCodeOfFile } from '@/lib/letter-code';
import { queryKeys } from '@/lib/query-keys';
import { Dialog } from '@/components/ui/Dialog';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem } from '@/types/items';

/** File names in a human order: "Letter 2" before "Letter 10". */
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * The window listing every letter of a lot. Letters have no automatic code: choose the scanned files from your computer
 * and each file's name (without .pdf / .jpg …) becomes that letter's code. Many files at once fill the letters that have
 * no code yet, in name order; "Choose" on a row sets or changes just that one.
 */
export function LetterCodesDialog({ lotId, lotReference, items, onClose }: { lotId: string; lotReference: string; items: GridItem[]; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const letters = useMemo(() => [...items].sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  /** The file name picked for a letter (itemId → file name). */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const many = useRef<HTMLInputElement>(null);
  const one = useRef<HTMLInputElement>(null);
  const oneFor = useRef<string | null>(null);

  const pending = letters.filter((l) => isPendingCode(l.code));
  const codeOf = (l: GridItem) => (picked[l.id] !== undefined ? letterCodeOfFile(picked[l.id]!) : null);

  /** Problems with the picked codes: unusable names, a name picked twice, or one already used by another letter here. */
  const problems = useMemo(() => {
    const out = new Map<string, string>();
    const count = new Map<string, number>();
    for (const l of letters) {
      const c = picked[l.id] !== undefined ? letterCodeOfFile(picked[l.id]!) : null;
      if (c) count.set(c, (count.get(c) ?? 0) + 1);
    }
    const existing = new Map(letters.filter((l) => !isPendingCode(l.code) && picked[l.id] === undefined).map((l) => [l.code, l.id]));
    for (const l of letters) {
      const c = picked[l.id] !== undefined ? letterCodeOfFile(picked[l.id]!) : null;
      if (c === null) continue;
      const bad = letterCodeError(c);
      if (bad) out.set(l.id, bad);
      else if ((count.get(c) ?? 0) > 1) out.set(l.id, 'Picked for more than one letter.');
      else if (existing.has(c)) out.set(l.id, 'Another letter here already has this code.');
    }
    return out;
  }, [letters, picked]);

  const chosen = letters.filter((l) => picked[l.id] !== undefined);
  const save = useMutation({
    mutationFn: () => itemsGridApi.setLetterCodes(lotId, { assignments: chosen.map((l) => ({ itemId: l.id, code: picked[l.id]! })) }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.history(lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
      toast.success(`${r.updated} ${r.updated === 1 ? 'code' : 'codes'} set from the files`);
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not save the codes.'),
  });

  const onMany = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = [...files].sort(byName);
    // Fill the letters that have no code and no pick yet, in sheet order.
    const free = letters.filter((l) => isPendingCode(l.code) && picked[l.id] === undefined);
    const next = { ...picked };
    free.slice(0, list.length).forEach((l, i) => {
      next[l.id] = list[i]!.name;
    });
    setPicked(next);
    const left = list.length - free.length;
    setNote(left > 0 ? `${left} ${left === 1 ? 'file' : 'files'} had no empty letter left and ${left === 1 ? 'was' : 'were'} skipped.` : null);
    setError(null);
    if (many.current) many.current.value = '';
  };
  const onOne = (files: FileList | null) => {
    const f = files?.[0];
    const id = oneFor.current;
    if (f && id) setPicked((p) => ({ ...p, [id]: f.name }));
    setError(null);
    if (one.current) one.current.value = '';
  };

  return (
    <Dialog title="Letter codes from scanned files" subtitle={`${lotReference} · ${letters.length} ${letters.length === 1 ? 'letter' : 'letters'}, ${pending.length} without a code`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13px] text-ink-2">
          Choose the scanned letters from your computer. Each file&apos;s name, without .pdf or .jpg, becomes that letter&apos;s code.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton type="button" onClick={() => many.current?.click()} disabled={pending.length === 0 && chosen.length === letters.length}>
            Choose scanned files…
          </PrimaryButton>
          {chosen.length > 0 ? (
            <GhostButton type="button" onClick={() => setPicked({})}>
              Clear choices
            </GhostButton>
          ) : null}
          <span className="text-[12px] text-ink-3">Many files at once fill the empty letters in name order.</span>
        </div>
        <input ref={many} type="file" multiple className="hidden" onChange={(e) => onMany(e.target.files)} aria-label="Choose scanned letter files" />
        <input ref={one} type="file" className="hidden" onChange={(e) => onOne(e.target.files)} aria-label="Choose the scanned file of one letter" />
        {note ? (
          <p role="note" className="m-0 text-[12px] text-warn">
            {note}
          </p>
        ) : null}

        <div className="max-h-[48dvh] overflow-y-auto rounded-[8px] border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 bg-surface-sunken text-left text-[11.5px] uppercase tracking-[0.05em] text-ink-3">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="px-3 py-2">Code now</th>
                <th className="px-3 py-2">New code from the file</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {letters.map((l, i) => {
                const c = codeOf(l);
                const bad = problems.get(l.id);
                return (
                  <tr key={l.id} className="border-t border-line-soft">
                    <td className="px-3 py-1.5 tabular-nums text-ink-3">{i + 1}</td>
                    <td className="px-3 py-1.5">{isPendingCode(l.code) ? <span className="text-ink-4">— no code yet —</span> : <span className="font-mono">{l.code}</span>}</td>
                    <td className="px-3 py-1.5">
                      {c ? (
                        <span className={bad ? 'text-danger' : 'font-mono font-semibold text-good'}>
                          {c}
                          {bad ? <span className="ml-2 font-sans text-[11.5px] font-normal">{bad}</span> : null}
                        </span>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-accent hover:underline"
                        onClick={() => {
                          oneFor.current = l.id;
                          one.current?.click();
                        }}
                      >
                        {c || !isPendingCode(l.code) ? 'Change' : 'Choose'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <FormError message={error} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[12px] text-ink-3" aria-live="polite">
            {chosen.length} of {letters.length} chosen
          </span>
          <GhostButton type="button" onClick={onClose}>
            Close
          </GhostButton>
          <PrimaryButton type="button" disabled={chosen.length === 0 || problems.size > 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : `Set ${chosen.length} ${chosen.length === 1 ? 'code' : 'codes'}`}
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
