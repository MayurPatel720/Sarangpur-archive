'use client';

import { useState } from 'react';
import { GhostButton, TextInput } from '@/components/ui/Form';
import { IconTrash } from '@/components/ui/icons';

/** Editable list of checklist item texts for a task that does not exist yet. */
export function ChecklistDraftEditor({
  items,
  onChange,
  max = 50,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (text && items.length < max) onChange([...items, text]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((text, i) => (
        <div key={`${i}-${text}`} className="flex items-center gap-2 text-[13px] text-ink">
          <span className="flex-1 break-words">{text}</span>
          <button
            type="button"
            aria-label={`Remove ${text}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="w-8 h-8 flex items-center justify-center bg-transparent border-0 text-ink-4 hover:text-danger cursor-pointer"
          >
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={200}
          placeholder="Add a checklist item…"
          aria-label="New checklist item"
        />
        <GhostButton type="button" onClick={add} disabled={draft.trim() === '' || items.length >= max}>
          Add
        </GhostButton>
      </div>
    </div>
  );
}
