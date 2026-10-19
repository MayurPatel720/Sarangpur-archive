'use client';

import { useState } from 'react';
import { QUADRANTS, flagsOf, quadrantMeta, type QuadrantId } from '@/lib/todo';
import { date, todayIso } from '@/lib/format';
import { Badge } from '@/components/ui/primitives';
import { GhostButton, Select } from '@/components/ui/Form';
import { IconCalendar, IconPlus } from '@/components/ui/icons';
import type { Todo } from '@/types/todo';

/**
 * Quadrant look. Colour comes from the design tokens only, and every tile also prints its name and
 * hint, so colour is never the only signal. The tint sits on the header band; the body stays on the
 * plain surface so the cards read as the content.
 */
const TILE: Record<QuadrantId, { band: string; title: string; pill: string; accent: string }> = {
  do: { band: 'bg-good-bg border-good-line', title: 'text-good', pill: 'bg-good-bg text-good border-good-line', accent: 'border-t-good-mark' },
  schedule: { band: 'bg-warn-bg border-warn-line', title: 'text-warn', pill: 'bg-warn-bg text-warn border-warn-line', accent: 'border-t-warn-mark' },
  delegate: { band: 'bg-info-bg border-info-line', title: 'text-info', pill: 'bg-info-bg text-info border-info-line', accent: 'border-t-info-mark' },
  delete: { band: 'bg-danger-bg border-danger-line', title: 'text-danger', pill: 'bg-danger-bg text-danger border-danger-line', accent: 'border-t-danger-mark' },
};

/** Rows of the grid: Important on top, Not important below; columns Urgent | Not urgent. */
const GRID: { axis: string; tiles: [QuadrantId, QuadrantId] }[] = [
  { axis: 'Important', tiles: ['do', 'schedule'] },
  { axis: 'Not important', tiles: ['delegate', 'delete'] },
];

export interface TodoActions {
  onToggleDone: (t: Todo) => void;
  onEdit: (t: Todo) => void;
  onMove: (t: Todo, quadrant: QuadrantId) => void;
  onQuickAdd: (title: string, quadrant: QuadrantId) => void;
  onDelegate: (t: Todo) => void;
  onDrop: (t: Todo) => void;
  canDelegate: boolean;
  /** True while a write is in flight. */
  busy: boolean;
}

/** Due date as a chip: overdue reads as a problem, today as a warning, later as plain information. */
function DueChip({ due }: { due: string }) {
  const today = todayIso();
  const tone =
    due < today
      ? 'border-danger-line bg-danger-bg text-danger'
      : due === today
        ? 'border-warn-line bg-warn-bg text-warn'
        : 'border-line bg-surface-sunken text-ink-3';
  return (
    <span className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[2px] text-[11px] font-semibold tabular-nums ${tone}`}>
      <IconCalendar size={11} />
      {due < today ? 'Overdue · ' : due === today ? 'Today · ' : ''}
      {date(due)}
    </span>
  );
}

/**
 * The Eisenhower matrix: four tiles on two axes (Urgent / Not urgent across, Important / Not
 * important down). Cards can be dragged to another tile, or moved with the "Move" menu (keyboard and
 * touch); each tile has a quick-add line.
 */
export function TodoMatrix({ rows, counts, actions }: { rows: Todo[]; counts: Record<QuadrantId, number>; actions: TodoActions }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<QuadrantId | null>(null);
  const byQuadrant = (id: QuadrantId) => rows.filter((r) => r.quadrant === id);

  const tile = (id: QuadrantId) => {
    const q = quadrantMeta(id);
    const t = TILE[id];
    const items = byQuadrant(id);
    return (
      <section
        key={id}
        aria-label={`${q.label} quadrant`}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          setOver(id);
        }}
        onDragLeave={() => setOver((o) => (o === id ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          const todo = rows.find((r) => r.id === dragId);
          setOver(null);
          setDragId(null);
          if (todo && todo.quadrant !== id) actions.onMove(todo, id);
        }}
        className={`flex min-h-[260px] min-w-0 flex-col overflow-hidden rounded-[10px] border border-t-[3px] border-line bg-surface shadow-control transition-shadow ${t.accent} ${
          over === id ? 'ring-2 ring-accent' : ''
        }`}
      >
        <header className={`flex flex-col gap-0.5 border-b px-3.5 py-2.5 ${t.band}`}>
          <div className="flex items-center gap-2">
            <h2 className={`m-0 text-[17px] font-semibold tracking-[-0.015em] ${t.title}`}>{q.label}</h2>
            <span className={`inline-flex min-w-[22px] items-center justify-center rounded-full border px-1.5 text-[11.5px] font-semibold tabular-nums ${t.pill}`}>
              {counts[id]}
            </span>
          </div>
          <p className="m-0 text-[12px] leading-snug text-ink-2">{q.hint}</p>
        </header>

        <ul className="m-0 flex flex-1 list-none flex-col gap-2 p-3">
          {items.map((todo) => (
            <li
              key={todo.id}
              draggable
              onDragStart={() => setDragId(todo.id)}
              onDragEnd={() => {
                setDragId(null);
                setOver(null);
              }}
              className="group flex cursor-grab flex-col gap-1.5 rounded-[8px] border border-line bg-surface-subtle px-3 py-2.5 transition-colors hover:border-line-strong active:cursor-grabbing"
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-[1px] h-[18px] w-[18px] shrink-0 cursor-pointer accent-accent"
                  checked={todo.done}
                  onChange={() => actions.onToggleDone(todo)}
                  aria-label={`Mark “${todo.title}” done`}
                />
                <button
                  type="button"
                  onClick={() => actions.onEdit(todo)}
                  className={`min-w-0 flex-1 cursor-pointer break-words border-0 bg-transparent p-0 text-left text-[13.5px] font-medium leading-snug hover:underline ${
                    todo.done ? 'text-ink-3 line-through' : 'text-ink'
                  }`}
                >
                  {todo.title}
                </button>
              </div>
              {todo.dueDate || todo.delegatedTaskId || (id === 'delegate' && !todo.delegatedTaskId && actions.canDelegate) || id === 'delete' ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-[28px]">
                  {todo.dueDate ? <DueChip due={todo.dueDate} /> : null}
                  {todo.delegatedTaskId ? (
                    <Badge severity="info">Delegated{todo.delegatedTaskTitle ? `: ${todo.delegatedTaskTitle}` : ''}</Badge>
                  ) : null}
                  {id === 'delegate' && !todo.delegatedTaskId && actions.canDelegate ? (
                    <GhostButton className="!h-7 !px-2.5 text-[12px]" onClick={() => actions.onDelegate(todo)}>
                      Assign to someone…
                    </GhostButton>
                  ) : null}
                  {id === 'delete' ? (
                    <GhostButton className="!h-7 !px-2.5 text-[12px]" onClick={() => actions.onDrop(todo)}>
                      Drop it
                    </GhostButton>
                  ) : null}
                </div>
              ) : null}
              {/* The move menu stays out of the way until the card is hovered or focused (always visible on touch screens). */}
              <label className="flex items-center gap-1.5 pl-[28px] md:h-0 md:overflow-hidden md:opacity-0 md:transition-all md:group-focus-within:h-7 md:group-focus-within:opacity-100 md:group-hover:h-7 md:group-hover:opacity-100">
                <span className="text-[11px] font-medium text-ink-3">Move to</span>
                <Select
                  value={todo.quadrant}
                  onChange={(e) => actions.onMove(todo, e.target.value as QuadrantId)}
                  disabled={actions.busy}
                  aria-label={`Move “${todo.title}” to another quadrant`}
                  className="!h-7 !w-auto !px-2 !text-[11.5px]"
                >
                  {QUADRANTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
            </li>
          ))}
          {items.length === 0 ? (
            <li className="m-0 flex flex-1 list-none items-center justify-center rounded-[8px] border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-4">
              Nothing here yet. Add one below, or drag a card in.
            </li>
          ) : null}
        </ul>

        <QuickAdd quadrant={id} disabled={actions.busy} onAdd={(title) => actions.onQuickAdd(title, id)} />
      </section>
    );
  };

  return (
    <div role="group" aria-label="Eisenhower matrix" className="flex flex-col gap-3">
      {/* Column labels (desktop) */}
      <div className="hidden gap-3 md:grid md:grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)]">
        <span aria-hidden />
        {['Urgent', 'Not urgent'].map((label) => (
          <span key={label} className="text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {label}
          </span>
        ))}
      </div>
      {GRID.map((row) => (
        <div key={row.axis} className="grid grid-cols-1 gap-3 md:grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)]">
          <span
            aria-hidden
            className="hidden items-center justify-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3 md:flex [writing-mode:vertical-rl] rotate-180"
          >
            {row.axis}
          </span>
          {row.tiles.map(tile)}
        </div>
      ))}
    </div>
  );
}

function QuickAdd({ quadrant, disabled, onAdd }: { quadrant: QuadrantId; disabled: boolean; onAdd: (title: string) => void }) {
  const [text, setText] = useState('');
  const label = quadrantMeta(quadrant).label;
  return (
    <form
      className="border-t border-line-soft p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        onAdd(t);
        setText('');
      }}
    >
      <label className="flex h-9 items-center gap-2 rounded-[6px] border border-line bg-surface-sunken px-2.5 focus-within:border-accent">
        <IconPlus size={14} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={160}
          placeholder={`Add to ${label}`}
          disabled={disabled}
          aria-label={`Quick add to ${label}`}
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
        />
        <kbd className="hidden rounded-[4px] border border-line px-1.5 text-[10.5px] font-semibold text-ink-4 sm:inline">Enter</kbd>
      </label>
    </form>
  );
}

export { flagsOf };
