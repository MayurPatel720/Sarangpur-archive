import type { Severity } from '@/types/dashboard';

/** Indian digit grouping — 1,284 and 86,402 read correctly for this team. */
export function num(value: number): string {
  return value.toLocaleString('en-IN');
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function longDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}

/** "14:52" — the archive runs on a 24-hour clock. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** "today, 14:52" / "3 days ago, 09:05" — used in the activity feed. */
export function relativeStamp(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  const time = clock(iso);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago, ${time}`;
  return `${then.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${time}`;
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
