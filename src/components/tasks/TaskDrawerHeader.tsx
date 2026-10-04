'use client';

import { Badge, Skeleton } from '@/components/ui/primitives';
import { IconX } from '@/components/ui/icons';
import { InlineEditText } from '@/components/tasks/InlineEditText';
import { TaskMoreMenu } from '@/components/tasks/TaskMoreMenu';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import type { TaskRow } from '@/types/task';

/** Sticky drawer header: editable title (admin), status + priority badges, "⋯" menu, close. */
export function TaskDrawerHeader({
  task,
  canEdit,
  canCancel,
  pending,
  onRename,
  onCancelTask,
  onClose,
}: {
  task: TaskRow | undefined;
  canEdit: boolean;
  canCancel: boolean;
  pending: boolean;
  onRename: (title: string) => void;
  onCancelTask: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-surface border-b border-line-soft px-4 md:px-6 py-3 flex items-start gap-2">
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {task ? (
          <>
            <h2 className="m-0 text-[16px] font-semibold leading-snug text-ink">
              <InlineEditText
                value={task.title}
                canEdit={canEdit}
                onSave={onRename}
                maxLength={160}
                ariaLabel="Task title"
              />
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
              {task.overdue ? <Badge severity="critical">Overdue</Badge> : null}
            </div>
          </>
        ) : (
          <Skeleton className="h-5 w-56" />
        )}
      </div>
      {canCancel && task && task.status !== 'cancelled' ? (
        <TaskMoreMenu pending={pending} onCancelTask={onCancelTask} />
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="w-9 h-9 flex items-center justify-center bg-transparent border-0 text-ink-3 hover:text-ink cursor-pointer"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}
