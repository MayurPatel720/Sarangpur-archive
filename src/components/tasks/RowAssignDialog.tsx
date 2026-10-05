'use client';

import { useEffect, useState } from 'react';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from '@/lib/domain';
import { todayIso } from '@/lib/format';
import { EMPTY_ASSIGN_DRAFT, type RowAssignDraft } from '@/lib/row-assign';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea } from '@/components/ui/Form';
import { AssigneeMultiSelect } from '@/components/tasks/AssigneeMultiSelect';
import { ChecklistDraftEditor } from '@/components/tasks/ChecklistDraftEditor';
import type { TaskAssignee } from '@/types/task';

/**
 * Trimmed "Assign task" dialog for one media row of the project wizard / Add media.
 * Lot, project, format and title are not asked for — the server links them to the
 * lot it creates. The first person added owns the lot; everyone added works the task.
 *
 * Without the task-assign grant (`canAssignTasks` false) only the lot owner is asked
 * for: no task is created, so no details / checklist / priority / due date.
 *
 * It only edits a draft — nothing is sent until the project is created.
 */
export function RowAssignDialog({
  initial,
  canAssignTasks,
  onSave,
  onClear,
  onClose,
  serverError,
}: {
  initial: RowAssignDraft | null;
  canAssignTasks: boolean;
  onSave: (draft: RowAssignDraft) => void;
  /** Present only when a draft exists — removes the assignment. */
  onClear?: () => void;
  onClose: () => void;
  /** A failure the server reported for this format on the last submit. */
  serverError?: string;
}) {
  const users = useUserPicker();
  const start = initial ?? EMPTY_ASSIGN_DRAFT;
  const [assignees, setAssignees] = useState<TaskAssignee[]>(start.assignees);
  const [description, setDescription] = useState(start.description);
  const [checklist, setChecklist] = useState<string[]>(start.checklist);
  const [priority, setPriority] = useState<TaskPriority>(start.priority);
  const [dueDate, setDueDate] = useState(start.dueDate);
  const [error, setError] = useState<string | null>(serverError ?? null);

  // This dialog can sit on top of another Dialog (Add media). Escape must close only
  // the top one, so swallow it before the other dialog's document listener sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const dueError = canAssignTasks && dueDate && dueDate < todayIso() ? 'The due date cannot be in the past.' : null;
  const canSave = assignees.length > 0 && !dueError;

  const save = () => {
    if (assignees.length === 0) {
      setError('Pick at least one person.');
      return;
    }
    if (dueError) {
      setError(dueError);
      return;
    }
    onSave(
      canAssignTasks
        ? {
            assignees,
            description: description.trim(),
            checklist: checklist.map((c) => c.trim()).filter(Boolean),
            priority,
            dueDate,
          }
        : { ...EMPTY_ASSIGN_DRAFT, assignees: assignees.slice(0, 1) },
    );
  };

  return (
    <Dialog
      title="Assign"
      subtitle="Applies to every row of this format — one lot is created per format. Nothing is sent until you create the project."
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {canAssignTasks ? (
          <>
            <Field label="Details">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={4}
                aria-label="Task details"
              />
            </Field>
            <Field label="Checklist">
              <ChecklistDraftEditor items={checklist} onChange={setChecklist} />
            </Field>
            <Field label="Assign to" required hint="First person added owns the lot; others work the task.">
              <AssigneeMultiSelect selected={assignees} onChange={setAssignees} canEdit />
            </Field>
            {assignees[0] ? (
              <p className="m-0 -mt-2 text-[12px] text-ink-3">Lot owner: {assignees[0].name}</p>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Priority">
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due date" error={dueError ?? undefined}>
                <DatePicker value={dueDate} onChange={setDueDate} aria-label="Due date (dd/mm/yyyy)" />
              </Field>
            </div>
          </>
        ) : (
          <Field label="Lot owner" required hint="The owner works this lot end to end.">
            <Select
              value={assignees[0]?.id ?? ''}
              onChange={(e) => {
                const u = (users.data?.users ?? []).find((x) => x.id === e.target.value);
                setAssignees(u ? [{ id: u.id, name: u.name }] : []);
              }}
              aria-label="Lot owner"
            >
              <option value="">Choose a person…</option>
              {(users.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2.5 border-t border-line-soft pt-4">
          {onClear ? (
            <GhostButton type="button" onClick={onClear} className="mr-auto">
              Remove assignment
            </GhostButton>
          ) : null}
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="button" onClick={save} disabled={!canSave}>
            Assign
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
