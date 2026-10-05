import { FORMATS, FORMAT_LABELS, type Format, type TaskPriority } from '@/lib/domain';
import type { TaskAssignee } from '@/types/task';
import type { ProjectAssignment, ProjectTaskInput } from '@/types/project';

/**
 * Per-format assignment drafts for the project wizard / Add media dialog.
 * The unit is the FORMAT (a project creates one lot per format), so rows of the
 * same format share one draft. `assignees[0]` owns the lot; everyone listed works
 * the task. Users without the task-assign grant only ever get `assignees` (the owner).
 */
export interface RowAssignDraft {
  assignees: TaskAssignee[];
  description: string;
  checklist: string[];
  priority: TaskPriority;
  /** ISO `YYYY-MM-DD` or ''. */
  dueDate: string;
}

export type RowAssignDrafts = Record<string, RowAssignDraft>;

export const EMPTY_ASSIGN_DRAFT: RowAssignDraft = {
  assignees: [],
  description: '',
  checklist: [],
  priority: 'normal',
  dueDate: '',
};

const isTaskFormat = (f: string): f is Format => (FORMATS as readonly string[]).includes(f);

/**
 * Wire payload from the drafts. Only formats in `formats` (those with at least one
 * row right now) are submitted; a draft whose format was removed stays in memory.
 * The lot owner is the first assignee; the task (grant holders only) carries them all.
 */
export function buildAssignPayload(
  drafts: RowAssignDrafts,
  formats: string[],
  canAssignTasks: boolean,
): { assignments: ProjectAssignment[]; tasks: ProjectTaskInput[] } {
  const assignments: ProjectAssignment[] = [];
  const tasks: ProjectTaskInput[] = [];
  for (const format of new Set(formats)) {
    const d = drafts[format];
    const owner = d?.assignees[0];
    if (!d || !owner) continue;
    assignments.push({ format, assigneeId: owner.id });
    if (canAssignTasks && isTaskFormat(format)) {
      const checklist = d.checklist.map((c) => c.trim()).filter(Boolean);
      tasks.push({
        format,
        ...(d.description.trim() ? { description: d.description.trim() } : {}),
        checklist,
        priority: d.priority,
        ...(d.dueDate ? { dueDate: d.dueDate } : {}),
        assigneeIds: [...new Set(d.assignees.map((a) => a.id))],
      });
    }
  }
  return { assignments, tasks };
}

/**
 * The server prefixes a task failure with "<Format label> lot task: ". Returns the
 * format that message is about, so the UI can reopen that format's dialog.
 */
export function formatFromTaskError(message: string, formats: string[]): string | null {
  for (const f of formats) {
    const label = isTaskFormat(f) ? FORMAT_LABELS[f] : f;
    if (message.startsWith(`${label} lot task:`)) return f;
  }
  return null;
}
