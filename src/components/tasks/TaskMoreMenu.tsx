'use client';

import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** The header's "⋯" menu (admin only). Today it holds "Cancel task", which asks for confirmation. */
export function TaskMoreMenu({ pending, onCancelTask }: { pending: boolean; onCancelTask: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 flex items-center justify-center bg-transparent border-0 text-[18px] leading-none text-ink-3 hover:text-ink cursor-pointer"
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[160px] bg-surface border border-line rounded-[6px] shadow-panel py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            className="w-full text-left px-3 py-2 bg-surface hover:bg-surface-sunken border-0 text-[13px] text-danger cursor-pointer"
          >
            Cancel task
          </button>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title="Cancel this task?"
          body="Everyone on the task is notified. Only an admin can reopen a cancelled task."
          confirmLabel="Cancel task"
          cancelLabel="Keep task"
          pending={pending}
          onConfirm={() => {
            setConfirming(false);
            onCancelTask();
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
