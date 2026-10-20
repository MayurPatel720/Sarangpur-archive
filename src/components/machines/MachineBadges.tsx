import { daysUntil, MACHINE_CONDITION_LABELS, MACHINE_CONDITION_SEVERITY, SERVICE_SOON_DAYS, type MachineCondition } from '@/lib/machine';
import { date } from '@/lib/format';
import { Badge } from '@/components/ui/primitives';

export function ConditionBadge({ condition }: { condition: MachineCondition }) {
  return <Badge severity={MACHINE_CONDITION_SEVERITY[condition]}>{MACHINE_CONDITION_LABELS[condition]}</Badge>;
}

/** `overdue` / `soon` / null (not due, or no schedule). */
export function serviceState(due: string | null, today: string): 'overdue' | 'soon' | null {
  if (!due) return null;
  const d = daysUntil(due, today);
  return d < 0 ? 'overdue' : d <= SERVICE_SOON_DAYS ? 'soon' : null;
}

/** Service chip: the word says it too, never colour alone. */
export function ServiceChip({ due, today }: { due: string | null; today: string }) {
  const state = serviceState(due, today);
  if (!due || !state) return null;
  const tone = state === 'overdue' ? 'border-danger-line bg-danger-bg text-danger' : 'border-warn-line bg-warn-bg text-warn';
  return (
    <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-[2px] text-[11px] font-semibold tabular-nums whitespace-nowrap ${tone}`}>
      {state === 'overdue' ? 'Service overdue · ' : 'Service due · '}
      {date(due)}
    </span>
  );
}

export function UsageChip({ inUse }: { inUse: boolean }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-line bg-surface-sunken px-1.5 py-[2px] text-[11px] font-semibold text-ink-2 whitespace-nowrap">
      {inUse ? 'In use' : 'Not in use'}
    </span>
  );
}

export function LoanChip({ to }: { to: string }) {
  return (
    <span className="inline-flex max-w-[220px] items-center rounded-[4px] border border-info-line bg-info-bg px-1.5 py-[2px] text-[11px] font-semibold text-info">
      <span className="truncate">Lent to {to}</span>
    </span>
  );
}
