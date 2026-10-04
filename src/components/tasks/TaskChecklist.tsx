'use client';

import { useState } from 'react';
import { Meter } from '@/components/ui/primitives';
import { GhostButton, TextInput } from '@/components/ui/Form';
import { IconTrash } from '@/components/ui/icons';
import type { TaskChecklistItem } from '@/types/task';

/** Checklist with progress bar. Every change saves the whole list through `onSave`. */
export function TaskChecklist({
  items,
  canEdit,
  pending,
  onSave,
}: {
  items: TaskChecklistItem[];
  canEdit: boolean;
  pending: boolean;
  onSave: (items: { id?: string; text: string; done: boolean }[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const done = items.filter((i) => i.done).length;
  const percent = items.length > 0 ? (done / items.length) * 100 : 0;

  const toggle = (id: string) =>
    onSave(items.map((i) => ({ id: i.id, text: i.text, done: i.id === id ? !i.done : i.done })));
  const remove = (id: string) =>
    onSave(items.filter((i) => i.id !== id).map((i) => ({ id: i.id, text: i.text, done: i.done })));
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onSave([...items.map((i) => ({ id: i.id, text: i.text, done: i.done })), { text, done: false }]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2.5">
      {items.length > 0 ? (
        <div className="flex items-center gap-2">
          <Meter percent={percent} severity={done === items.length ? 'good' : 'info'} className="flex-1" />
          <span className="text-[11.5px] text-ink-3 tnum">
            {done} of {items.length} done
          </span>
        </div>
      ) : (
        <p className="m-0 text-[12.5px] text-ink-3">No checklist items.</p>
      )}
      <ul className="m-0 p-0 list-none flex flex-col">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 min-h-[36px]">
            <input
              type="checkbox"
              checked={i.done}
              disabled={!canEdit || pending}
              onChange={() => toggle(i.id)}
              aria-label={i.text}
              className="w-4 h-4 flex-shrink-0 accent-accent cursor-pointer"
            />
            <span className={`flex-1 text-[13px] break-words ${i.done ? 'text-ink-3 line-through' : 'text-ink'}`}>
              {i.text}
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => remove(i.id)}
                disabled={pending}
                aria-label={`Remove ${i.text}`}
                className="w-8 h-8 flex items-center justify-center bg-transparent border-0 text-ink-4 hover:text-danger cursor-pointer"
              >
                <IconTrash size={14} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item…"
            maxLength={200}
            aria-label="New checklist item"
          />
          <GhostButton type="submit" disabled={pending || draft.trim() === ''}>
            Add
          </GhostButton>
        </form>
      ) : null}
    </div>
  );
}
