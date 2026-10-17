/**
 * The Eisenhower matrix for personal to-dos. Pure — shared by the server, the screens and the
 * verify script. A to-do carries two flags; its quadrant is derived from them.
 *
 *                 Urgent      Not urgent
 *   Important     Do          Schedule
 *   Not important Delegate    Delete
 */

export const QUADRANTS = [
  { id: 'do', label: 'Do', urgent: true, important: true, hint: 'Clear deadline and real consequences if it slips. Do it now.' },
  { id: 'schedule', label: 'Schedule', urgent: false, important: true, hint: 'No fixed deadline, but it moves you toward your goals. Plan a time.' },
  { id: 'delegate', label: 'Delegate', urgent: true, important: false, hint: 'Has to get done, but not by you. Hand it to someone.' },
  { id: 'delete', label: 'Delete', urgent: false, important: false, hint: 'Distracts you and adds no value. Drop it.' },
] as const;

export type QuadrantId = (typeof QUADRANTS)[number]['id'];
export const QUADRANT_IDS = QUADRANTS.map((q) => q.id) as [QuadrantId, ...QuadrantId[]];

export const quadrantOf = (urgent: boolean, important: boolean): QuadrantId =>
  urgent ? (important ? 'do' : 'delegate') : important ? 'schedule' : 'delete';

export const quadrantMeta = (id: QuadrantId) => QUADRANTS.find((q) => q.id === id)!;

/** The flags that put a to-do in a quadrant. */
export const flagsOf = (id: QuadrantId): { urgent: boolean; important: boolean } => {
  const q = quadrantMeta(id);
  return { urgent: q.urgent, important: q.important };
};

/** A to-do list holds at most this many open to-dos per person. */
export const MAX_OPEN_TODOS = 500;

/** Days before the due date from which the form suggests "Urgent". */
export const URGENT_WITHIN_DAYS = 2;

/** True when `dueDate` (`YYYY-MM-DD`) is today, past, or within `URGENT_WITHIN_DAYS` of `today`. */
export function suggestUrgent(dueDate: string | null | undefined, today: string): boolean {
  if (!dueDate) return false;
  const days = (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= URGENT_WITHIN_DAYS;
}
