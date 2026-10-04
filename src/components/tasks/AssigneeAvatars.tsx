import type { TaskAssignee } from '@/types/task';

/** "Asha Rao" -> "AR"; "Bala" -> "B". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? '?'];
  return letters.map((p) => (p ?? '').charAt(0).toUpperCase()).join('');
}

/**
 * Compact assignee display: overlapping initial circles (max 3) then the names as
 * "Asha, Bala +1". The names carry the meaning; the circles are decoration.
 */
export function AssigneeAvatars({ assignees, max = 2 }: { assignees: TaskAssignee[]; max?: number }) {
  if (assignees.length === 0) return <span className="text-ink-4">Unassigned</span>;
  const shown = assignees.slice(0, max);
  const extra = assignees.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={assignees.map((a) => a.name).join(', ')}>
      <span aria-hidden className="inline-flex -space-x-1.5">
        {assignees.slice(0, 3).map((a) => (
          <span
            key={a.id}
            className="w-5 h-5 rounded-full border border-surface bg-accent-soft text-ink-2 text-[9px] font-semibold flex items-center justify-center"
          >
            {initialsOf(a.name)}
          </span>
        ))}
      </span>
      <span className="truncate">
        {shown.map((a) => a.name).join(', ')}
        {extra > 0 ? ` +${extra}` : ''}
      </span>
    </span>
  );
}
