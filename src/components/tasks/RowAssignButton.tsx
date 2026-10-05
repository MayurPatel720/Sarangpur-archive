'use client';

import type { RowAssignDraft } from '@/lib/row-assign';

/**
 * The per-row control in a media table's Actions column. Unassigned: an "Assign"
 * button (disabled until the row has a format). Assigned: a chip with the assignee
 * names (the lot owner first) that re-opens the dialog. `locked` is for a format that
 * already has a lot (Add media): a read-only chip, no second owner / task.
 */
export function RowAssignButton(props: RowAssignButtonProps) {
  const { error } = props;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <RowAssignControl {...props} />
      {error ? (
        <span role="alert" className="block max-w-[220px] whitespace-normal text-right text-[11.5px] font-medium text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

interface RowAssignButtonProps {
  format: string;
  draft: RowAssignDraft | undefined;
  /** Set when the format already has a lot: its assignee name, or null when unassigned. */
  locked?: { name: string | null };
  /** A server failure naming this row's format. */
  error?: string;
  onOpen: () => void;
}

function RowAssignControl({
  format,
  draft,
  locked,
  error,
  onOpen,
}: RowAssignButtonProps) {
  const chip = 'inline-flex items-center h-8 max-w-[180px] px-2.5 rounded-full border text-[12px] font-semibold';

  if (locked) {
    const label = locked.name ? `Already assigned: ${locked.name}` : 'Unassigned';
    return (
      <span className={`${chip} border-line bg-surface-sunken text-ink-3`} title={label}>
        <span className="truncate">{label}</span>
      </span>
    );
  }

  const owner = draft?.assignees[0];
  if (draft && owner) {
    const names = draft.assignees.map((a, i) => (i === 0 ? `${a.name} (lot owner)` : a.name)).join(', ');
    const short = draft.assignees.map((a) => a.name).join(', ');
    return (
      <button
        type="button"
        onClick={onOpen}
        title={error ? `${error} — click to edit` : `${names} — click to edit`}
        aria-label={`Assigned to ${names}. Edit assignment`}
        className={`${chip} cursor-pointer ${error ? 'border-danger-line bg-danger-bg text-danger' : 'border-line bg-accent-soft text-ink'}`}
      >
        <span className="truncate">{short}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!format}
      title={error ?? (format ? 'Assign this format' : 'Pick a format first')}
      className={`inline-flex items-center h-8 px-3 rounded-full border text-[12px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-surface-sunken ${error ? 'border-danger-line bg-danger-bg text-danger' : 'border-line-strong bg-surface text-ink-2 hover:text-ink'}`}
    >
      Assign
    </button>
  );
}
