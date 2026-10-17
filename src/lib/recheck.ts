/**
 * Prasadi quality-check scheduling. Pure — shared by the server, the grid and the verify script.
 * A check is due a whole number of weeks after the day it was set; days are UTC calendar days.
 */

export const MAX_RECHECK_WEEKS = 260;
const DAY_MS = 86_400_000;

/** Midnight (UTC) of `from` plus `weeks` weeks. */
export function nextCheckDate(from: Date, weeks: number): Date {
  const day = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return new Date(day + weeks * 7 * DAY_MS);
}

/** Whole days a check is overdue at `now` (0 when due today, negative when not yet due). */
export function daysOverdue(due: Date, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - due.getTime()) / DAY_MS);
}

/** "1 week" / "3 weeks". */
export const weeksText = (n: number): string => `${n} ${n === 1 ? 'week' : 'weeks'}`;

/** Result of a check, as stored in the item's Condition column. */
export const CHECK_RESULTS = [
  { value: 'good', label: 'Good' },
  { value: 'needs_care', label: 'Needs care' },
] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number]['value'];
