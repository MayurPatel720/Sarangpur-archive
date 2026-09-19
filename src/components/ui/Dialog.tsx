'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Modal dialog. Closes on Escape or scrim click; locks body scroll while open.
 * Content (usually a form with its own buttons) goes in children.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 border-0 cursor-default"
      />
      <div className="relative w-full sm:max-w-[520px] max-h-[92dvh] overflow-auto bg-surface border border-line rounded-t-[12px] sm:rounded-[12px] shadow-panel">
        <div className="sticky top-0 bg-surface border-b border-line-soft px-4 md:px-5 h-12 flex items-center">
          <h2 className="m-0 text-[14px] font-semibold text-ink">{title}</h2>
        </div>
        <div className="px-4 md:px-5 py-4 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
