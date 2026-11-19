'use client';

import { useEffect, useState } from 'react';
import type { LotHistory } from '@/hooks/useLotHistory';
import type { HistView, ShowChanges } from '@/lib/history-view';
import { Dialog } from '@/components/ui/Dialog';
import { GhostButton, PrimaryButton } from '@/components/ui/Form';
import { IconClock } from '@/components/ui/icons';
import { Menu, menuItem } from '@/components/master/MasterMenus';
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
 * Undo / Redo buttons, the History side panel, "Show changes" (highlights on the current sheet), the keyboard
 * shortcuts (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) and the conflict dialog of a lot's Excel.
 */
export function HistoryControls({
  history,
  canEdit,
  lotId,
  view,
  onView,
  showChanges,
  onShowChanges,
  onPanelChange,
}: {
  history: LotHistory;
  canEdit: boolean;
  lotId: string;
  /** The sheet currently showing a past state (null = the current sheet). */
  view: HistView | null;
  onView: (v: HistView | null) => void;
  showChanges: ShowChanges | null;
  onShowChanges: (v: ShowChanges | null) => void;
  /** Tells the sheet when the side panel opens / closes, so it can make room instead of sitting under it. */
  onPanelChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onPanelChange?.(open);
    return () => onPanelChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const { data, pending } = history;
  const canUndo = canEdit && !view && Boolean(data?.canUndo) && !pending;
  const canRedo = canEdit && !view && Boolean(data?.canRedo) && !pending;

  useEffect(() => {
    if (!canEdit || view) return;
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
  }, [canEdit, view, canUndo, canRedo, history]);

  const conflict = history.conflict;
  const changesOn = showChanges !== null && !view;

  return (
    <>
      {canEdit && !view ? (
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
      <button
        type="button"
        className={`${iconBtn} ${open ? '!border-accent !bg-accent-soft' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="History"
        aria-pressed={open}
        title="History: sessions and saved versions"
      >
        <IconClock size={15} />
      </button>
      {!view ? (
        <Menu
          label="Show changes"
          width={250}
          align="right"
          className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-semibold hover:bg-accent-soft ${changesOn ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2'}`}
          trigger={<>Changes {changesOn ? '●' : '▾'}</>}
        >
          {(close) => (
            <>
              <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">Highlight on the sheet</div>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { onShowChanges(null); close(); }}>
                {showChanges === null ? '✓ ' : ''}Off
              </button>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { onShowChanges('last'); close(); }}>
                {showChanges === 'last' ? '✓ ' : ''}Since my last session
              </button>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { onShowChanges('today'); close(); }}>
                {showChanges === 'today' ? '✓ ' : ''}Today
              </button>
              {(data?.versions ?? []).slice(0, 8).map((v) => (
                <button key={v.id} type="button" role="menuitem" className={menuItem} onClick={() => { onShowChanges(v.id); close(); }}>
                  {showChanges === v.id ? '✓ ' : ''}Since “{v.name}”
                </button>
              ))}
            </>
          )}
        </Menu>
      ) : null}

      {open ? (
        <HistoryPanel
          lotId={lotId}
          history={history}
          canEdit={canEdit}
          view={view}
          onView={(v) => {
            if (v) onShowChanges(null);
            onView(v);
          }}
          onClose={() => {
            setOpen(false);
            onView(null);
          }}
        />
      ) : null}

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
