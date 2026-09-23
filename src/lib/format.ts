import type { Severity } from '@/types/dashboard';

/** Indian digit grouping — 1,284 and 86,402 read correctly for this team. */
export function num(value: number): string {
  return value.toLocaleString('en-IN');
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Canonical calendar date — always `dd/mm/yyyy`.
 * Accepts ISO strings (`YYYY-MM-DD` or full timestamps), `dd/mm/yyyy`, or `Date`.
 * Date-only strings (`YYYY-MM-DD`) parse as local calendar days so the
 * display never shifts a day across timezones.
 */
export function date(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Display form of a `YYYY-MM-DD` (or empty) value as `dd/mm/yyyy`. */
export function isoToDmy(iso: string): string {
  if (!iso) return '';
  const d = toDate(iso);
  return d ? date(d) : '';
}

/**
 * Parse `dd/mm/yyyy` → `YYYY-MM-DD` for the API.
 * Returns null when the string is incomplete or not a real calendar day.
 */
export function dmyToIso(dmy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2200) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Today's calendar date as `dd/mm/yyyy` (local). */
export function todayDmy(): string {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** `dd/mm/yyyy, HH:mm` — 24-hour clock (local). */
export function dateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${date(d)}, ${clockOf(d)}`;
}

function toDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const local = new Date(year, month - 1, day);
    if (
      local.getFullYear() !== year ||
      local.getMonth() !== month - 1 ||
      local.getDate() !== day
    ) {
      return null;
    }
    return local;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const local = new Date(y, m - 1, day);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Canonical display date — `dd/mm/yyyy`. */
export function longDate(iso: string): string {
  return date(iso);
}

function clockOf(d: Date): string {
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** "14:52" — the archive runs on a 24-hour clock. */
export function clock(iso: string): string {
  const d = toDate(iso);
  if (!d) return '—';
  return clockOf(d);
}

/** `dd/mm/yyyy, HH:mm` — absolute; no relative “Today/N days ago” labels. */
export function relativeStamp(iso: string, _now = new Date()): string {
  return dateTime(iso);
}

/** "in_progress" → "In progress" — enum values in selects and readouts. */
export function prettyEnum(value: string): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

/** Raw bytes → human unit (B/KB/MB/GB/TB), one decimal. */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const unit = units[i] ?? 'B';
  return `${(bytes / 1024 ** i).toFixed(1)} ${unit}`;
}
export const severityText: Record<Severity, string> = {
  neutral: 'text-ink-3',
  info: 'text-info',
  good: 'text-good',
  warning: 'text-warn',
  critical: 'text-danger',
};

/** Solid dot colour, for timeline and badge marks. */
export const severityMark: Record<Severity, string> = {
  neutral: 'bg-neutral-mark',
  info: 'bg-info-mark',
  good: 'bg-good-mark',
  warning: 'bg-warn-mark',
  critical: 'bg-danger-mark',
};

/** Badge and tinted-surface classes. */
export const severityChip: Record<Severity, string> = {
  neutral: 'bg-neutral-bg border-neutral-line text-neutral',
  info: 'bg-info-bg border-info-line text-info',
  good: 'bg-good-bg border-good-line text-good',
  warning: 'bg-warn-bg border-warn-line text-warn',
  critical: 'bg-danger-bg border-danger-line text-danger',
};

/** Meter fill colour. The unfilled track is always a lighter step of the same ramp. */
export const severityFill: Record<Severity, string> = {
  neutral: 'bg-accent',
  info: 'bg-accent',
  good: 'bg-good-mark',
  warning: 'bg-warn-mark',
  critical: 'bg-danger-mark',
};
