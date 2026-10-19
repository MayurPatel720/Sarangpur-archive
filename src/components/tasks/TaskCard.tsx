import Link from 'next/link';
import { FORMAT_LABELS } from '@/lib/domain';
import { IconBox, IconClipboardList } from '@/components/ui/icons';
import { AssigneeAvatars } from '@/components/tasks/AssigneeAvatars';
import { TaskDueChip } from '@/components/tasks/TaskDueChip';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import type { TaskRow } from '@/types/task';

const chipLink =
  'inline-flex items-center gap-1 font-medium text-ink-2 no-underline hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-[2px]';

/**
 * One task as a compact card: title, status, then a single meta line — assignees,
 * format, due chip, lot / project links, checklist count. The title opens the drawer;
 * lot / project chips are real links (so they sit beside the button, never inside it).
 */
export function TaskCard({
  task,
  onOpen,
  showAssignee = true,
}: {
  task: TaskRow;
  onOpen: (id: string) => void;
  showAssignee?: boolean;
}) {
  const finished = task.status === 'done' || task.status === 'cancelled';

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 border-b border-line-row last:border-b-0 min-w-0 transition-colors hover:bg-surface-subtle">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          title={task.title}
          className={`flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer text-[14px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-[2px] truncate touch-manipulation ${
            finished ? 'text-ink-3 line-through decoration-ink-4' : 'text-ink'
          }`}
        >
          {task.title}
        </button>
        {task.priority !== 'normal' ? <TaskPriorityBadge priority={task.priority} /> : null}
        <TaskStatusBadge status={task.status} />
      </div>

      {task.status === 'blocked' && task.blockedReason ? (
        <p className="m-0 text-[12px] text-danger break-words">Blocked: {task.blockedReason}</p>
      ) : null}

      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px] text-ink-3 min-w-0">
        {showAssignee ? (
          <span className="min-w-0 max-w-[220px] text-ink-2">
            <AssigneeAvatars assignees={task.assignees} />
          </span>
        ) : null}
        {task.personal ? <span>Personal</span> : <span>{FORMAT_LABELS[task.format]}</span>}
        <TaskDueChip dueDate={task.dueDate} overdue={task.overdue} />
        {task.lotId && task.lotCode ? (
          <Link href={`/register/${task.lotId}`} className={chipLink}>
            <IconClipboardList size={12} />
            {task.lotCode}
          </Link>
        ) : null}
        {task.projectId && task.projectCode ? (
          <Link href={`/projects/${task.projectId}`} className={chipLink}>
            <IconBox size={12} />
            {task.projectCode}
          </Link>
        ) : null}
        {task.checklistTotal > 0 ? (
          <span className="tnum" title="Checklist progress" aria-label={`${task.checklistDone} of ${task.checklistTotal} checklist items done`}>
            Checklist {task.checklistDone}/{task.checklistTotal}
          </span>
        ) : null}
      </div>
    </div>
  );
}
