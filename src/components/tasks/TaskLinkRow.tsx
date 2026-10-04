'use client';

import Link from 'next/link';
import { EmptyValue } from '@/components/ui/primitives';
import { TaskLinkPicker } from '@/components/tasks/TaskLinkPicker';

/**
 * A task's lot / project as a property value: a link to it (with "Remove" for the
 * admin), or — when empty — the search picker for the admin and a dash for everyone else.
 */
export function TaskLinkRow({
  kind,
  id,
  code,
  canEdit,
  disabled,
  onChange,
}: {
  kind: 'lot' | 'project';
  id: string | null;
  code: string | null;
  canEdit: boolean;
  disabled: boolean;
  onChange: (nextId: string | null) => void;
}) {
  if (id && code) {
    const href = kind === 'lot' ? `/register/${id}` : `/projects/${id}`;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Link href={href} className="text-accent font-semibold text-[13px] break-all">
          {code}
        </Link>
        {canEdit ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label={`Unlink ${kind} ${code}`}
            className="bg-transparent border-0 p-0 text-[12px] text-ink-3 hover:text-danger cursor-pointer disabled:cursor-default"
          >
            Remove
          </button>
        ) : null}
      </div>
    );
  }
  if (!canEdit) return <EmptyValue />;
  return <TaskLinkPicker kind={kind} value={null} onChange={(link) => link && onChange(link.id)} />;
}
