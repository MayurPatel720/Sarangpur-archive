'use client';

import { useEffect, useRef, useState } from 'react';
import { useUserPicker } from '@/hooks/useUserPicker';
import { IconX } from '@/components/ui/icons';
import { initialsOf } from '@/components/tasks/AssigneeAvatars';
import type { TaskAssignee } from '@/types/task';

/**
 * Assignee chips plus an "Add assignee" picker over the active users. With `canEdit`
 * false it is plain chips. `minCount` keeps the last person(s) from being removed (the
 * drawer needs 1; the create dialog validates on submit instead).
 */
export function AssigneeMultiSelect({
  selected,
  onChange,
  canEdit,
  minCount = 0,
  disabled = false,
}: {
  selected: TaskAssignee[];
  onChange: (next: TaskAssignee[]) => void;
  canEdit: boolean;
  minCount?: number;
  disabled?: boolean;
}) {
  const users = useUserPicker();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const chosen = new Set(selected.map((s) => s.id));
  const needle = search.trim().toLowerCase();
  const options = (users.data?.users ?? []).filter(
    (u) => !chosen.has(u.id) && (!needle || u.name.toLowerCase().includes(needle)),
  );
  const canRemove = canEdit && selected.length > minCount;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5 min-w-0">
      <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
        {selected.length === 0 ? <li className="text-[12.5px] text-ink-4">Nobody yet</li> : null}
        {selected.map((a) => (
          <li
            key={a.id}
            className="inline-flex items-center gap-1.5 max-w-full h-7 pl-1 pr-2 rounded-full border border-line bg-surface-sunken text-[12px] font-medium text-ink"
          >
            <span
              aria-hidden
              className="w-5 h-5 rounded-full bg-accent-soft text-ink-2 text-[9px] font-semibold flex items-center justify-center flex-shrink-0"
            >
              {initialsOf(a.name)}
            </span>
            <span className="truncate">{a.name}</span>
            {canRemove ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${a.name}`}
                onClick={() => onChange(selected.filter((s) => s.id !== a.id))}
                className="w-4 h-4 flex items-center justify-center bg-transparent border-0 p-0 text-ink-3 hover:text-danger cursor-pointer disabled:cursor-default"
              >
                <IconX size={11} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <>
          <button
            type="button"
            disabled={disabled}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="self-start h-7 px-2.5 rounded-full border border-dashed border-line-strong bg-transparent text-[12px] font-semibold text-ink-2 hover:text-ink cursor-pointer disabled:opacity-60"
          >
            + Add assignee
          </button>
          {open ? (
            <div className="absolute left-0 top-full mt-1 z-20 w-full min-w-[220px] bg-surface border border-line rounded-[6px] shadow-panel">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people…"
                aria-label="Search people"
                className="w-full h-9 px-3 bg-surface border-0 border-b border-line-soft rounded-t-[6px] text-[13px] text-ink"
              />
              <ul className="m-0 p-0 list-none max-h-[220px] overflow-y-auto">
                {options.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange([...selected, { id: u.id, name: u.name }]);
                        setSearch('');
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 bg-surface hover:bg-surface-sunken border-0 text-[12.5px] text-ink cursor-pointer"
                    >
                      {u.name}
                    </button>
                  </li>
                ))}
                {options.length === 0 ? (
                  <li className="px-3 py-2 text-[12px] text-ink-3">
                    {users.isLoading ? 'Loading…' : 'No one else to add.'}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
