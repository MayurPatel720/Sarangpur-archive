import { num } from '@/lib/format';
import type { TaskPersonCount } from '@/types/task';

/**
 * Admin strip: one chip per person with open / overdue / blocked counts. Clicking a
 * name filters the panel to that person; clicking it again clears the filter.
 */
export function TaskPeopleStrip({
  people,
  selectedId,
  onSelect,
}: {
  people: TaskPersonCount[];
  selectedId: string | undefined;
  onSelect: (userId: string | undefined) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div role="group" aria-label="Filter by person" className="flex gap-2 overflow-x-auto px-4 md:px-5 py-2.5 border-b border-line-soft">
      {people.map((p) => {
        const active = p.userId === selectedId;
        return (
          <button
            key={p.userId}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? undefined : p.userId)}
            className={`flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-[6px] border text-left cursor-pointer ${
              active ? 'bg-accent-soft border-accent' : 'bg-surface border-line hover:bg-surface-sunken'
            }`}
          >
            <span className="text-[12.5px] font-semibold text-ink">{active ? '✓ ' : ''}{p.userName}</span>
            <span className="text-[11px] text-ink-3 tnum">
              {num(p.open)} open
              {p.overdue > 0 ? ` · ${num(p.overdue)} overdue` : ''}
              {p.blocked > 0 ? ` · ${num(p.blocked)} blocked` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
