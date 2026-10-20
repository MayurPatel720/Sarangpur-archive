import type { Severity } from '@/types/dashboard';

/**
 * Machines register — shared constants and pure helpers (client and server).
 * One Machine document holds its parts, loans, repairs and history; see src/models/Machine.ts.
 */

export const MACHINE_CONDITIONS = ['working', 'needs_repair', 'not_working'] as const;
export type MachineCondition = (typeof MACHINE_CONDITIONS)[number];

export const MACHINE_CONDITION_LABELS: Record<MachineCondition, string> = {
  working: 'Working',
  needs_repair: 'Needs repair',
  not_working: 'Not working',
};

export const MACHINE_CONDITION_SEVERITY: Record<MachineCondition, Severity> = {
  working: 'good',
  needs_repair: 'warning',
  not_working: 'critical',
};

export const MACHINE_SOURCES = ['purchased', 'donated', 'lent', 'other'] as const;
export type MachineSource = (typeof MACHINE_SOURCES)[number];

export const MACHINE_SOURCE_LABELS: Record<MachineSource, string> = {
  purchased: 'Purchased',
  donated: 'Donated',
  lent: 'Lent to us',
  other: 'Other',
};

/** Suggestions for the category box (free text is allowed). */
export const MACHINE_CATEGORY_SUGGESTIONS = [
  'Audio recorder',
  'Camera',
  'Scanner',
  'Computer',
  'Storage drive',
  'Player',
  'Projector',
  'Other',
] as const;

export const MACHINE_HISTORY_KINDS = ['created', 'edited', 'condition', 'usage', 'loan', 'repair', 'service', 'part', 'note'] as const;
export type MachineHistoryKind = (typeof MACHINE_HISTORY_KINDS)[number];

/** Newest-first cap on the embedded history (older entries drop off). */
export const MAX_MACHINE_HISTORY = 1000;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` plus whole months (day clamped to the month's length). */
export function addMonthsIso(iso: string, months: number): string {
  const m = DAY.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const first = new Date(Date.UTC(y, mo, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

/**
 * When the next service is due: the last service (or the day we got the machine) plus the
 * interval. Null when no interval is set or there is no starting day.
 */
export function nextServiceDue(
  intervalMonths: number | null,
  lastServicedOn: string | null,
  acquiredOn: string | null,
): string | null {
  const from = lastServicedOn ?? acquiredOn;
  if (!intervalMonths || !from) return null;
  return addMonthsIso(from, intervalMonths);
}

/** Days from `today` to `due` (negative = overdue). */
export function daysUntil(due: string, today: string): number {
  const a = DAY.exec(due);
  const b = DAY.exec(today);
  if (!a || !b) return 0;
  const ms = Date.UTC(+a[1]!, +a[2]! - 1, +a[3]!) - Date.UTC(+b[1]!, +b[2]! - 1, +b[3]!);
  return Math.round(ms / 86_400_000);
}

/** A service is "due soon" within this many days. */
export const SERVICE_SOON_DAYS = 30;
