'use client';

import {
  FORMATS,
  FORMAT_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type Format,
  type TaskPriority,
} from '@/lib/domain';
import { date, dateTime12 } from '@/lib/format';
import { EmptyValue } from '@/components/ui/primitives';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select } from '@/components/ui/Form';
import { AssigneeMultiSelect } from '@/components/tasks/AssigneeMultiSelect';
import { TaskLinkRow } from '@/components/tasks/TaskLinkRow';
import { TaskPropertyRow } from '@/components/tasks/TaskPropertyRow';
import type { TaskDetailResponse, TaskUpdateBody } from '@/types/task';

/**
 * Jira-style property list. The admin edits each row in place (every change is one
 * `update` call); everyone else sees plain values. Changing the lot makes the task's
 * format follow the lot (the server enforces it), so the format select is disabled
 * while a lot is linked.
 */
export function TaskProperties({
  task,
  canEdit,
  pending,
  onUpdate,
}: {
  task: TaskDetailResponse['task'];
  canEdit: boolean;
  pending: boolean;
  onUpdate: (body: TaskUpdateBody) => void;
}) {
  const personal = task.personal;
  return (
    <div className="flex flex-col gap-4">
      {personal ? null : (
      <TaskPropertyRow label="Assignees">
        <AssigneeMultiSelect
          selected={task.assignees}
          canEdit={canEdit}
          minCount={1}
          disabled={pending}
          onChange={(next) => onUpdate({ assigneeIds: next.map((a) => a.id) })}
        />
      </TaskPropertyRow>
      )}

      <TaskPropertyRow label="Importance">
        {canEdit ? (
          <Select
            value={task.priority}
            disabled={pending}
            onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
            aria-label="Task priority"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        ) : (
          TASK_PRIORITY_LABELS[task.priority]
        )}
      </TaskPropertyRow>

      <TaskPropertyRow label="Due date">
        {canEdit ? (
          <DatePicker
            value={task.dueDate ?? ''}
            onChange={(iso) => {
              if (iso !== (task.dueDate ?? '')) onUpdate({ dueDate: iso || null });
            }}
            aria-label="Task due date (dd/mm/yyyy)"
          />
        ) : task.dueDate ? (
          date(task.dueDate)
        ) : (
          <EmptyValue />
        )}
      </TaskPropertyRow>

      {personal ? null : (
      <>
      <TaskPropertyRow label="Format" hint={canEdit && task.lotId ? 'Follows the linked lot.' : undefined}>
        {canEdit ? (
          <Select
            value={task.format}
            disabled={pending || task.lotId !== null}
            onChange={(e) => onUpdate({ format: e.target.value as Format })}
            aria-label="Task format"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        ) : (
          FORMAT_LABELS[task.format]
        )}
      </TaskPropertyRow>

      <TaskPropertyRow label="Lot">
        <TaskLinkRow
          kind="lot"
          id={task.lotId}
          code={task.lotCode}
          canEdit={canEdit}
          disabled={pending}
          onChange={(lotId) => onUpdate({ lotId })}
        />
      </TaskPropertyRow>

      <TaskPropertyRow label="Project">
        <TaskLinkRow
          kind="project"
          id={task.projectId}
          code={task.projectCode}
          canEdit={canEdit}
          disabled={pending}
          onChange={(projectId) => onUpdate({ projectId })}
        />
      </TaskPropertyRow>
      </>
      )}

      <dl className="m-0 pt-3 border-t border-line-soft flex flex-col gap-0.5 text-[11.5px] text-ink-3">
        <div className="flex gap-1">
          <dt>Created by</dt>
          <dd className="m-0">{task.createdByName}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Created on</dt>
          <dd className="m-0">{dateTime12(task.createdAt)}</dd>
        </div>
        {task.doneAt ? (
          <div className="flex gap-1">
            <dt>Done on</dt>
            <dd className="m-0">{dateTime12(task.doneAt)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
