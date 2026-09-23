'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { PrimaryButton, FormError } from './Form';

/**
 * Destructive / consequential confirmation. Cancel is focused by default so a
 * stray Enter never confirms. Errors stay inside the dialog; success is the
 * caller's toast.
 */
export function ConfirmDialog({
  title,
  body,
  meta,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  pending = false,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  body: ReactNode;
  meta?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <Dialog title={title} subtitle={meta} onClose={pending ? () => undefined : onClose}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13px] leading-relaxed text-ink-2 break-words [overflow-wrap:anywhere]">{body}</p>

        {children ? <div className="flex flex-col gap-3 text-left">{children}</div> : null}

        {error ? <FormError message={error} /> : null}

        <div className="flex justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 px-4 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] font-semibold text-ink-2 cursor-pointer disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          {tone === 'danger' ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="h-10 px-4 bg-danger-mark border border-danger-mark rounded-[6px] text-white text-[13px] font-semibold cursor-pointer shadow-control disabled:opacity-60"
            >
              {pending ? 'Working…' : confirmLabel}
            </button>
          ) : (
            <PrimaryButton onClick={onConfirm} disabled={pending}>
              {pending ? 'Working…' : confirmLabel}
            </PrimaryButton>
          )}
        </div>
      </div>
    </Dialog>
  );
}
