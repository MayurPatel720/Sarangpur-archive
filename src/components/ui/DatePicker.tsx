'use client';

import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@/components/ui/Form';
import { IconCalendar } from '@/components/ui/icons';
import { dmyToIso, isoToDmy } from '@/lib/format';

/**
 * Day-first date field (`dd/mm/yyyy` text) that still opens the native calendar.
 * The browser's own date input is locale-driven (often month-first), so we never
 * show it — only the ISO value lives on a hidden input for `showPicker()`.
 */
export function DatePicker({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  /** ISO `YYYY-MM-DD` or `''`. */
  value: string;
  onChange: (iso: string) => void;
  'aria-label'?: string;
}) {
  const dateRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => isoToDmy(value));

  useEffect(() => {
    setText(isoToDmy(value));
  }, [value]);

  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div className="relative w-full min-w-0">
      <TextInput
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === '') {
            onChange('');
            return;
          }
          const iso = dmyToIso(next);
          if (iso) onChange(iso);
        }}
        onBlur={() => {
          // Snap back to canonical display if the user left a partial/invalid string.
          setText(isoToDmy(value));
        }}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel ?? 'Date (dd/mm/yyyy)'}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open calendar"
        className="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-8 w-9 items-center justify-center text-ink-3 hover:text-ink cursor-pointer"
        onClick={openPicker}
      >
        <IconCalendar size={16} />
      </button>
      <input
        ref={dateRef}
        type="date"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setText(isoToDmy(e.target.value));
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px border-0 p-0 opacity-0"
      />
    </div>
  );
}
