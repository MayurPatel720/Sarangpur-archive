import { date } from '@/lib/format';

/**
 * Due-date chip. Overdue is shown with the danger tokens AND the word "Overdue", so it
 * never relies on colour alone.
 */
export function TaskDueChip({ dueDate, overdue }: { dueDate: string | null; overdue: boolean }) {
  if (!dueDate) return <span className="text-ink-4 whitespace-nowrap">No due date</span>;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-[4px] border whitespace-nowrap font-medium ${
        overdue ? 'bg-danger-bg border-danger-line text-danger' : 'bg-surface-sunken border-line text-ink-2'
      }`}
    >
      {overdue ? 'Overdue · ' : 'Due '}
      {date(dueDate)}
    </span>
  );
}
