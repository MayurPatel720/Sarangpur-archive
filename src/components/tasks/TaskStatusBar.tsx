'use client';

import { useState } from 'react';
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from '@/lib/domain';
import { Field, FormError, GhostButton, PrimaryButton, Textarea } from '@/components/ui/Form';

/**
 * Compact status pills: To do / In progress / Blocked / Done. Blocked asks for the reason
 * first (the server refuses a blocked task without one). Cancelling lives in the drawer's
 * "⋯" menu, not here. A cancelled task shows no active pill; picking one reopens it.
 */
export function TaskStatusBar({
  status,
  canChange,
  pending,
  error,
  onChange,
}: {
  status: TaskStatus;
  canChange: boolean;
  pending: boolean;
  error: string | null;
  onChange: (status: TaskStatus, blockedReason?: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  const choices = TASK_STATUSES.filter((s) => s !== 'cancelled');

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Task status"
        className="inline-flex self-start max-w-full overflow-x-auto rounded-full border border-line-strong bg-surface shadow-control p-0.5"
      >
        {choices.map((s) => {
          const active = s === status;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              disabled={!canChange || pending || active}
              onClick={() => (s === 'blocked' ? setAsking(true) : onChange(s))}
              className={`h-8 px-3.5 rounded-full border-0 whitespace-nowrap text-[12.5px] font-semibold cursor-pointer disabled:cursor-default ${
                active ? 'bg-strong-bg text-on-strong' : 'bg-transparent text-ink-2 hover:bg-surface-sunken disabled:opacity-60'
              }`}
            >
              {active ? '✓ ' : ''}
              {TASK_STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>

      {asking ? (
        <form
          className="flex flex-col gap-2 p-3 bg-surface-sunken border border-line rounded-[6px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            onChange('blocked', reason.trim());
            setAsking(false);
            setReason('');
          }}
        >
          <Field label="What is blocking this?" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              autoFocus
              aria-label="Blocked reason"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <GhostButton type="button" onClick={() => setAsking(false)}>
              Never mind
            </GhostButton>
            <PrimaryButton type="submit" disabled={reason.trim() === '' || pending}>
              Mark blocked
            </PrimaryButton>
          </div>
        </form>
      ) : null}

      <FormError message={error} />
    </div>
  );
}
