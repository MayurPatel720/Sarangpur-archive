import { TASK_STATUS_LABELS, TASK_STATUS_SEVERITY, type TaskStatus } from '@/lib/domain';
import { Badge } from '@/components/ui/primitives';

/** Status chip — coloured dot plus the label, so status is never colour alone. */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge severity={TASK_STATUS_SEVERITY[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}
