'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, tasksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  FORMATS,
  FORMAT_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type Format,
  type TaskPriority,
} from '@/lib/domain';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AssigneeMultiSelect } from '@/components/tasks/AssigneeMultiSelect';
import { TaskLinkPicker, type TaskLink } from '@/components/tasks/TaskLinkPicker';
import type { TaskAssignee } from '@/types/task';
import { IconTrash } from '@/components/ui/icons';

/**
 * Admin creates a task. Format is chosen unless a lot is linked — then the lot's format
 * is used (the server enforces the same rule). `defaultFormat` pre-selects the format
 * dashboard the dialog was opened from.
 */
export function AssignTaskDialog({
  defaultFormat,
  onClose,
  onCreated,
}: {
  defaultFormat?: Format;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [format, setFormat] = useState<Format | ''>(defaultFormat ?? '');
  const [lot, setLot] = useState<TaskLink | null>(null);
  const [project, setProject] = useState<TaskLink | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [draftItem, setDraftItem] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lotFormat = lot?.format && (FORMATS as readonly string[]).includes(lot.format) ? (lot.format as Format) : null;
  const effectiveFormat = lotFormat ?? (format || null);

  const create = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeIds: assignees.map((a) => a.id),
        priority,
        dueDate: dueDate || undefined,
        format: effectiveFormat ?? undefined,
        lotId: lot?.id,
        projectId: project?.id,
        checklist: items,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      toast.success('Task assigned', `${res.task.title} → ${res.task.assignees.map((a) => a.name).join(', ')}`);
      onCreated?.(res.task.id);
      onClose();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not create the task.';
      setError(message);
      toast.error('Could not assign task', message);
    },
  });

  const addItem = () => {
    const text = draftItem.trim();
    if (text) setItems((prev) => [...prev, text]);
    setDraftItem('');
  };
  const canSubmit = title.trim() !== '' && assignees.length > 0 && effectiveFormat !== null && !create.isPending;

  return (
    <Dialog
      wide
      title="Assign task"
      subtitle="Anyone assigned can move it along; you are notified."
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-6">
          <div className="flex flex-col gap-4 min-w-0">
          <Field label="Title" required>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Scan the Diwali negatives"
              aria-label="Task title"
            />
          </Field>
          <Field label="Details">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={7}
              aria-label="Task details"
            />
          </Field>
          <Field label="Checklist">
            <div className="flex flex-col gap-2">
              {items.map((text, i) => (
                <div key={`${i}-${text}`} className="flex items-center gap-2 text-[13px] text-ink">
                  <span className="flex-1 break-words">{text}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${text}`}
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="w-8 h-8 flex items-center justify-center bg-transparent border-0 text-ink-4 hover:text-danger cursor-pointer"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <TextInput
                  value={draftItem}
                  onChange={(e) => setDraftItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                  maxLength={200}
                  placeholder="Add a checklist item…"
                  aria-label="New checklist item"
                />
                <GhostButton type="button" onClick={addItem} disabled={draftItem.trim() === ''}>
                  Add
                </GhostButton>
              </div>
            </div>
          </Field>

          </div>
          <aside className="flex flex-col gap-3.5 min-w-0 md:border-l md:border-line-soft md:pl-6">
            <Field label="Assign to" required hint="Add one or more people.">
              <AssigneeMultiSelect selected={assignees} onChange={setAssignees} canEdit />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Priority">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <DatePicker value={dueDate} onChange={setDueDate} aria-label="Due date (dd/mm/yyyy)" />
            </Field>
            <Field
              label="Format"
              required
              hint={lotFormat ? `Taken from the linked lot (${FORMAT_LABELS[lotFormat]}).` : undefined}
            >
              <Select
                value={effectiveFormat ?? ''}
                disabled={lotFormat !== null}
                onChange={(e) => setFormat(e.target.value as Format)}
                aria-label="Task format"
              >
                <option value="">Choose a format…</option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link a lot">
              <TaskLinkPicker kind="lot" value={lot} onChange={setLot} />
            </Field>
            <Field label="Link a project">
              <TaskLinkPicker kind="project" value={project} onChange={setProject} />
            </Field>
          </aside>
        </div>

        <FormError message={error} />
        <div className="flex justify-end gap-2.5 border-t border-line-soft pt-4">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Assigning…' : 'Assign task'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
