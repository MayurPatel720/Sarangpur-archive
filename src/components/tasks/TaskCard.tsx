import Link from 'next/link';
import { FORMAT_LABELS } from '@/lib/domain';
import { IconBox, IconClipboardList } from '@/components/ui/icons';
import { AssigneeAvatars } from '@/components/tasks/AssigneeAvatars';
import { TaskDueChip } from '@/components/tasks/TaskDueChip';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import type { TaskRow } from '@/types/task';

const tag =
  'inline-flex items-center gap-1 rounded-[4px] border border-line bg-surface-sunken px-1.5 py-px text-[11.5px] font-medium text-ink-2 no-underline';
const tagLink = `${tag} hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;

/**
 * One task as a card, read top to bottom: what it is and where it stands (title, priority,
 * status), who has it and when it is due, then quieter context (format, lot, project,
 * checklist). Overdue open tasks get a red left edge so they stand out while scrolling.
 * The title opens the drawer; lot / project tags are real links beside the button.
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
  const late = task.overdue && !finished;
  const hasContext =
    !task.personal || Boolean(task.lotCode) || Boolean(task.projectCode) || task.checklistTotal > 0;
  const pct = task.checklistTotal > 0 ? Math.round((task.checklistDone / task.checklistTotal) * 100) : 0;

  return (
    <div
      className={`flex flex-col gap-2 border-b border-l-[3px] border-b-line-row px-4 py-3 last:border-b-0 min-w-0 transition-colors hover:bg-surface-subtle ${
        late ? 'border-l-danger-mark' : 'border-l-transparent'
      } ${finished ? 'opacity-80' : ''}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          title={task.title}
          className={`flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer text-[15px] font-semibold leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-[2px] touch-manipulation break-words ${
            finished ? 'text-ink-3 line-through decoration-ink-4' : 'text-ink'
          }`}
        >
          {task.title}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {task.priority !== 'normal' ? <TaskPriorityBadge priority={task.priority} /> : null}
          <TaskStatusBadge status={task.status} />
        </div>
      </div>

      {task.status === 'blocked' && task.blockedReason ? (
        <p className="m-0 text-[12px] text-danger break-words">Blocked: {task.blockedReason}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2 min-w-0">
        {showAssignee ? (
          <span className="min-w-0 max-w-[260px]">
            <AssigneeAvatars assignees={task.assignees} />
          </span>
        ) : (
          <span />
        )}
        <span className="text-[12px]">
          <TaskDueChip dueDate={task.dueDate} overdue={task.overdue} />
        </span>
      </div>

      {hasContext ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
          {task.personal ? null : <span className={tag}>{FORMAT_LABELS[task.format]}</span>}
          {task.lotId && task.lotCode ? (
            <Link href={`/register/${task.lotId}`} className={tagLink}>
              <IconClipboardList size={12} />
              {task.lotCode}
            </Link>
          ) : null}
          {task.projectId && task.projectCode ? (
            <Link href={`/projects/${task.projectId}`} className={tagLink}>
              <IconBox size={12} />
              {task.projectCode}
            </Link>
          ) : null}
          {task.checklistTotal > 0 ? (
            <span
              className="ml-auto inline-flex items-center gap-2 text-[11.5px] text-ink-3 tnum"
              aria-label={`${task.checklistDone} of ${task.checklistTotal} checklist items done`}
            >
              <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-good-mark" style={{ width: `${pct}%` }} />
              </span>
              {task.checklistDone}/{task.checklistTotal}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
