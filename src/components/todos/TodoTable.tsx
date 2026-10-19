'use client';

import { QUADRANTS, type QuadrantId } from '@/lib/todo';
import { date } from '@/lib/format';
import { Badge } from '@/components/ui/primitives';
import { GhostButton, Select } from '@/components/ui/Form';
import type { Todo, TodoListQuery } from '@/types/todo';
import type { TodoActions } from './TodoMatrix';

const QUADRANT_SEVERITY: Record<QuadrantId, 'good' | 'warning' | 'info' | 'critical'> = {
  do: 'good',
  schedule: 'warning',
  delegate: 'info',
  delete: 'critical',
};

type SortKey = TodoListQuery['sort'];

/** The same to-dos as a table: sort by a column, edit a row, move it, tick it done. */
export function TodoTable({
  rows,
  sort,
  dir,
  onSort,
  actions,
}: {
  rows: Todo[];
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  actions: TodoActions;
}) {
  const head = (key: SortKey, label: string) => (
    <th
      scope="col"
      aria-sort={sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="whitespace-nowrap border-b border-line bg-surface-sunken px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3"
    >
      <button type="button" onClick={() => onSort(key)} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-ink-3 hover:text-ink">
        {label}
        {sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-[13px] text-ink-2 tabular-nums">
        <thead>
          <tr>
            <th scope="col" className="w-10 border-b border-line bg-surface-sunken px-3 py-2.5">
              <span className="sr-only">Done</span>
            </th>
            {head('title', 'Title')}
            {head('quadrant', 'Quadrant')}
            {head('due', 'Due')}
            {head('created', 'Added')}
            <th scope="col" className="border-b border-line bg-surface-sunken px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Move to
            </th>
            <th scope="col" className="border-b border-line bg-surface-sunken px-3 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="hover:bg-accent-soft">
              <td className="border-b border-line-soft px-3 py-2.5 align-middle">
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px] cursor-pointer accent-accent"
                  checked={t.done}
                  onChange={() => actions.onToggleDone(t)}
                  aria-label={`Mark “${t.title}” ${t.done ? 'not done' : 'done'}`}
                />
              </td>
              <td className="max-w-[420px] border-b border-line-soft px-3 py-2.5 align-middle">
                <button
                  type="button"
                  onClick={() => actions.onEdit(t)}
                  className={`cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] font-medium hover:underline ${t.done ? 'text-ink-3 line-through' : 'text-ink'}`}
                >
                  {t.title}
                </button>
                {t.delegatedTaskId ? (
                  <span className="ml-2 align-middle">
                    <Badge severity="info">Delegated</Badge>
                  </span>
                ) : null}
              </td>
              <td className="border-b border-line-soft px-3 py-2.5 align-middle">
                <Badge severity={QUADRANT_SEVERITY[t.quadrant]}>{QUADRANTS.find((q) => q.id === t.quadrant)!.label}</Badge>
              </td>
              <td className="whitespace-nowrap border-b border-line-soft px-3 py-2.5 align-middle">{t.dueDate ? date(t.dueDate) : <span className="text-ink-4">—</span>}</td>
              <td className="whitespace-nowrap border-b border-line-soft px-3 py-2.5 align-middle">{date(t.createdAt)}</td>
              <td className="border-b border-line-soft px-3 py-2.5 align-middle">
                <Select
                  value={t.quadrant}
                  onChange={(e) => actions.onMove(t, e.target.value as QuadrantId)}
                  disabled={actions.busy}
                  aria-label={`Move “${t.title}” to another quadrant`}
                  className="!h-8 !w-auto !px-2 !text-[12px]"
                >
                  {QUADRANTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="whitespace-nowrap border-b border-line-soft px-3 py-2.5 align-middle text-right">
                {t.quadrant === 'delegate' && !t.delegatedTaskId && actions.canDelegate ? (
                  <GhostButton className="!h-8 !px-2.5 text-[12px]" onClick={() => actions.onDelegate(t)}>
                    Assign…
                  </GhostButton>
                ) : null}
                {t.quadrant === 'delete' ? (
                  <GhostButton className="!h-8 !px-2.5 text-[12px]" onClick={() => actions.onDrop(t)}>
                    Drop it
                  </GhostButton>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
