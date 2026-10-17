'use client';

import { useState } from 'react';
import { QUADRANTS, flagsOf, quadrantOf, quadrantMeta, suggestUrgent, type QuadrantId } from '@/lib/todo';
import { todayIso } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Textarea, TextInput } from '@/components/ui/Form';
import type { Todo, TodoCreateBody } from '@/types/todo';

/**
 * Add or edit a personal to-do. The two choices — Urgent and Important — decide its quadrant;
 * the quadrant name and hint update as they are ticked. A due date within two days suggests
 * Urgent (a hint, never forced).
 */
export function TodoDialog({
  todo,
  defaultQuadrant,
  pending,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  /** Present when editing. */
  todo?: Todo;
  /** Quadrant pre-selected for a new to-do. */
  defaultQuadrant?: QuadrantId;
  pending: boolean;
  error: string | null;
  onSave: (body: TodoCreateBody) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const start = todo ? { urgent: todo.urgent, important: todo.important } : flagsOf(defaultQuadrant ?? 'do');
  const [title, setTitle] = useState(todo?.title ?? '');
  const [note, setNote] = useState(todo?.note ?? '');
  const [urgent, setUrgent] = useState(start.urgent);
  const [important, setImportant] = useState(start.important);
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? '');

  const quadrant = quadrantMeta(quadrantOf(urgent, important));
  const hintUrgent = !urgent && suggestUrgent(dueDate || null, todayIso());

  return (
    <Dialog title={todo ? 'Edit to-do' : 'Add a to-do'} subtitle="Only you can see your to-dos." onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSave({ title: title.trim(), note: note.trim() || undefined, urgent, important, ...(dueDate ? { dueDate } : {}) });
        }}
      >
        <Field label="Title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus aria-label="To-do title" />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} aria-label="To-do note" />
        </Field>

        <fieldset className="m-0 flex flex-col gap-2 rounded-[8px] border border-line p-3">
          <legend className="px-1 text-[12px] font-semibold text-ink-2">How does it rank?</legend>
          <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Urgent <span className="text-[12px] text-ink-3">— has a deadline that is close</span>
          </label>
          <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={important} onChange={(e) => setImportant(e.target.checked)} />
            Important <span className="text-[12px] text-ink-3">— matters for your real goals</span>
          </label>
          <p className="m-0 text-[12.5px] text-ink-2" aria-live="polite">
            Goes to <span className="font-semibold text-ink">{quadrant.label}</span> — {quadrant.hint}
          </p>
        </fieldset>

        <Field label="Due date (optional)">
          <DatePicker value={dueDate} onChange={setDueDate} aria-label="Due date" />
        </Field>
        {hintUrgent ? (
          <p className="m-0 -mt-2 text-[12.5px] text-ink-2">
            This is due soon.{' '}
            <button type="button" onClick={() => setUrgent(true)} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-accent hover:underline">
              Mark it urgent
            </button>
          </p>
        ) : null}

        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          {onDelete ? (
            <GhostButton type="button" className="mr-auto" onClick={onDelete}>
              Delete
            </GhostButton>
          ) : null}
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : todo ? 'Save' : 'Add to-do'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

export { QUADRANTS };
