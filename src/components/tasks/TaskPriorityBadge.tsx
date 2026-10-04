import { TASK_PRIORITY_LABELS, TASK_PRIORITY_SEVERITY, type TaskPriority } from '@/lib/domain';
import { Badge } from '@/components/ui/primitives';

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge severity={TASK_PRIORITY_SEVERITY[priority]}>{TASK_PRIORITY_LABELS[priority]}</Badge>;
}
