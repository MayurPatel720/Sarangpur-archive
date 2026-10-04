'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Click-to-edit text. Saves on blur (and Enter for single-line, Ctrl/Cmd+Enter for
 * multi-line); Escape cancels. Read-only text when `canEdit` is false. An empty save is
 * ignored unless `allowEmpty`.
 */
export function InlineEditText({
  value,
  canEdit,
  onSave,
  multiline = false,
  allowEmpty = false,
  placeholder = 'Add…',
  maxLength,
  ariaLabel,
  textClassName = '',
}: {
  value: string;
  canEdit: boolean;
  onSave: (next: string) => void;
  multiline?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  maxLength?: number;
  ariaLabel: string;
  textClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const finished = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const text = value ? (
    <span className={`whitespace-pre-wrap break-words ${textClassName}`}>{value}</span>
  ) : (
    <span className={`text-ink-4 ${textClassName}`}>{placeholder}</span>
  );
  if (!canEdit) return value ? text : null;

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${ariaLabel} (click to edit)`}
        onClick={() => {
          finished.current = false;
          setDraft(value);
          setEditing(true);
        }}
        className="block w-full text-left bg-transparent border border-transparent hover:border-line rounded-[6px] px-2 py-1 -mx-2 cursor-text"
      >
        {text}
      </button>
    );
  }

  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim() || (!next && !allowEmpty)) return;
    onSave(next);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // do not also close the drawer
      finished.current = true;
      setEditing(false);
    } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  };
  const className = `block w-full bg-surface border border-line-strong rounded-[6px] px-2 py-1 -mx-2 text-ink ${textClassName}`;

  return multiline ? (
    <textarea
      value={draft}
      autoFocus
      rows={5}
      maxLength={maxLength}
      aria-label={ariaLabel}
      className={className}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
    />
  ) : (
    <input
      type="text"
      value={draft}
      autoFocus
      maxLength={maxLength}
      aria-label={ariaLabel}
      className={className}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
