'use client';

import { useState } from 'react';
import { QUADRANTS, flagsOf, quadrantMeta, type QuadrantId } from '@/lib/todo';
import { date } from '@/lib/format';
import { Badge } from '@/components/ui/primitives';
import { GhostButton, Select, TextInput } from '@/components/ui/Form';
import type { Todo } from '@/types/todo';

/** Quadrant look — design tokens only; the name and hint are always printed, so colour is never the signal. */
const TILE: Record<QuadrantId, { box: string; title: string }> = {
  do: { box: 'bg-good-bg border-good-line', title: 'text-good' },
  schedule: { box: 'bg-warn-bg border-warn-line', title: 'text-warn' },
  delegate: { box: 'bg-info-bg border-info-line', title: 'text-info' },
  delete: { box: 'bg-danger-bg border-danger-line', title: 'text-danger' },
};

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

/**
 * The Eisenhower matrix: four tiles. Cards can be dragged to another tile (or moved with the
 * "Move to" menu, for keyboard and touch); each tile has a quick-add line.
 */
export function TodoMatrix({ rows, counts, actions }: { rows: Todo[]; counts: Record<QuadrantId, number>; actions: TodoActions }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<QuadrantId | null>(null);
  const byQuadrant = (id: QuadrantId) => rows.filter((r) => r.quadrant === id);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="group" aria-label="Eisenhower matrix">
      {/* Column / row labels, as in the classic matrix. */}
      <div className="hidden md:col-span-2 md:grid md:grid-cols-2 gap-3 text-center text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
        <span>Urgent</span>
        <span>Not urgent</span>
      </div>
      {QUADRANTS.map((q) => (
        <section
          key={q.id}
          aria-label={`${q.label} quadrant`}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            setOver(q.id);
          }}
          onDragLeave={() => setOver((o) => (o === q.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            const t = rows.find((r) => r.id === dragId);
            setOver(null);
            setDragId(null);
            if (t && t.quadrant !== q.id) actions.onMove(t, q.id);
          }}
          className={`flex min-h-[220px] flex-col gap-2 rounded-[10px] border p-3 ${TILE[q.id].box} ${over === q.id ? 'outline outline-2 outline-accent' : ''}`}
        >
          <header className="flex flex-wrap items-baseline gap-x-2">
            <h2 className={`m-0 text-[18px] font-semibold ${TILE[q.id].title}`}>{q.label}</h2>
            <span className="text-[12px] tabular-nums text-ink-2">{counts[q.id]}</span>
            <span className="basis-full text-[12px] text-ink-2">{q.hint}</span>
            <span className="basis-full text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
              {q.urgent ? 'Urgent' : 'Not urgent'} · {q.important ? 'Important' : 'Not important'}
            </span>
          </header>

          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {byQuadrant(q.id).map((t) => (
              <li
                key={t.id}
                draggable
                onDragStart={() => setDragId(t.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOver(null);
                }}
                className="flex flex-col gap-1 rounded-[6px] border border-line bg-surface px-2.5 py-2 cursor-grab"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                    checked={t.done}
                    onChange={() => actions.onToggleDone(t)}
                    aria-label={`Mark “${t.title}” done`}
                  />
                  <button
                    type="button"
                    onClick={() => actions.onEdit(t)}
                    className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] font-medium text-ink hover:underline break-words"
                  >
                    {t.title}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[11.5px] text-ink-3">
                  {t.dueDate ? <span>Due {date(t.dueDate)}</span> : null}
                  {t.delegatedTaskId ? (
                    <Badge severity="info">Delegated{t.delegatedTaskTitle ? `: ${t.delegatedTaskTitle}` : ''}</Badge>
                  ) : null}
                  <label className="ml-auto flex items-center gap-1">
                    <span className="sr-only">Move “{t.title}” to</span>
                    <Select
                      value={t.quadrant}
                      onChange={(e) => actions.onMove(t, e.target.value as QuadrantId)}
                      disabled={actions.busy}
                      aria-label={`Move “${t.title}” to another quadrant`}
                      className="!h-7 !w-auto !px-2 !text-[11.5px]"
                    >
                      {QUADRANTS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id === t.quadrant ? `In ${o.label}` : `Move to ${o.label}`}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                {q.id === 'delegate' && !t.delegatedTaskId && actions.canDelegate ? (
                  <div className="pl-6">
                    <GhostButton className="!h-7 !px-2.5 text-[12px]" onClick={() => actions.onDelegate(t)}>
                      Assign to someone…
                    </GhostButton>
                  </div>
                ) : null}
                {q.id === 'delete' ? (
                  <div className="pl-6">
                    <GhostButton className="!h-7 !px-2.5 text-[12px]" onClick={() => actions.onDrop(t)}>
                      Drop it
                    </GhostButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <QuickAdd quadrant={q.id} disabled={actions.busy} onAdd={(title) => actions.onQuickAdd(title, q.id)} />
        </section>
      ))}
    </div>
  );
}

function QuickAdd({ quadrant, disabled, onAdd }: { quadrant: QuadrantId; disabled: boolean; onAdd: (title: string) => void }) {
  const [text, setText] = useState('');
  const label = quadrantMeta(quadrant).label;
  return (
    <form
      className="mt-auto"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        onAdd(t);
        setText('');
      }}
    >
      <TextInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={160}
        placeholder={`Add to ${label} — press Enter`}
        disabled={disabled}
        aria-label={`Quick add to ${label}`}
        className="!h-9 !text-[12.5px]"
      />
    </form>
  );
}

export { flagsOf };
