'use client';

import { useEffect, useState } from 'react';
import type { LotHistory } from '@/hooks/useLotHistory';
import { Dialog } from '@/components/ui/Dialog';
import { GhostButton, PrimaryButton } from '@/components/ui/Form';
import { IconClock } from '@/components/ui/icons';
import { HistoryPanel } from './HistoryPanel';

const iconBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-2 cursor-pointer hover:bg-accent-soft disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface';

/** True while the user is typing somewhere (a cell editor, an input, a dialog): then Ctrl+Z belongs to that. */
function typingIn(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t) return false;
  if (t.closest('input, textarea, select, [contenteditable="true"], .ag-cell-inline-editing, .ag-popup')) return true;
  return Boolean(document.querySelector('[role="dialog"]'));
}

/**
 * Undo / Redo buttons, the History panel, the keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) and the
 * conflict dialog of a lot's Excel.
 */
export function HistoryControls({ history, canEdit, lotId }: { history: LotHistory; canEdit: boolean; lotId: string }) {
  const [open, setOpen] = useState(false);
  const { data, pending } = history;
  const canUndo = canEdit && Boolean(data?.canUndo) && !pending;
  const canRedo = canEdit && Boolean(data?.canRedo) && !pending;

  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || typingIn(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey && canUndo) {
        e.preventDefault();
        void history.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        if (canRedo) {
          e.preventDefault();
          void history.redo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, canUndo, canRedo, history]);

  const conflict = history.conflict;

  return (
    <>
      {canEdit ? (
        <>
          <button
            type="button"
            className={iconBtn}
            disabled={!canUndo}
            onClick={() => void history.undo()}
            aria-label={data?.canUndo ? `Undo: ${data.canUndo.label}` : 'Undo'}
            title={data?.canUndo ? `Undo: ${data.canUndo.label} (Ctrl+Z)` : 'Nothing to undo'}
          >
            <span aria-hidden className="text-[16px] leading-none">↶</span>
          </button>
          <button
            type="button"
            className={iconBtn}
            disabled={!canRedo}
            onClick={() => void history.redo()}
            aria-label={data?.canRedo ? `Redo: ${data.canRedo.label}` : 'Redo'}
            title={data?.canRedo ? `Redo: ${data.canRedo.label} (Ctrl+Shift+Z)` : 'Nothing to redo'}
          >
            <span aria-hidden className="text-[16px] leading-none">↷</span>
          </button>
        </>
      ) : null}
      <button type="button" className={iconBtn} onClick={() => setOpen(true)} aria-label="History" title="History: sessions and saved versions">
        <IconClock size={15} />
      </button>

      {open ? <HistoryPanel lotId={lotId} history={history} canEdit={canEdit} onClose={() => setOpen(false)} /> : null}

      {conflict ? (
        <Dialog
          title="Some cells changed since"
          subtitle={`${conflict.res.label} was not applied: ${conflict.res.conflicts.length} ${conflict.res.conflicts.length === 1 ? 'row was' : 'rows were'} changed by someone after this edit.`}
          onClose={history.clearConflict}
        >
          <div className="flex flex-col gap-3">
            <ul className="m-0 flex max-h-[260px] list-none flex-col gap-1.5 overflow-y-auto p-0">
              {conflict.res.conflicts.slice(0, 50).map((c) => (
                <li key={c.itemId} className="rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-1.5 text-[12.5px]">
                  <span className="font-mono font-semibold text-ink">{c.code ?? 'Row'}</span>
                  <span className="text-ink-3"> · {c.paths.slice(0, 4).join(', ')}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[12.5px] text-ink-3">Nothing has been changed. You can undo everything else and leave these rows as they are now.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <GhostButton onClick={history.clearConflict}>Cancel</GhostButton>
              <PrimaryButton disabled={pending} onClick={() => void history.skipConflicts()}>
                {pending ? 'Working…' : 'Do the rest'}
              </PrimaryButton>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
