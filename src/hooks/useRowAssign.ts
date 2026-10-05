'use client';

import { useState } from 'react';
import { useCan } from '@/hooks/useCan';
import type { RowAssignDraft, RowAssignDrafts } from '@/lib/row-assign';

/**
 * State for the per-row "Assign" feature: drafts keyed by format (kept in memory even
 * when no row uses that format any more), which format's dialog is open, and an
 * error message per format (a server failure naming a format shows on that row).
 */
export function useRowAssign() {
  const canAssignTasks = useCan('task:assign');
  const [drafts, setDrafts] = useState<RowAssignDrafts>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  return {
    canAssignTasks,
    drafts,
    editing,
    errors,
    open: (format: string) => setEditing(format),
    close: () => setEditing(null),
    save: (format: string, draft: RowAssignDraft) => {
      setDrafts((prev) => ({ ...prev, [format]: draft }));
      setErrors((prev) => {
        if (!(format in prev)) return prev;
        const { [format]: _drop, ...rest } = prev;
        return rest;
      });
      setEditing(null);
    },
    clear: (format: string) => {
      setDrafts((prev) => {
        const { [format]: _drop, ...rest } = prev;
        return rest;
      });
      setEditing(null);
    },
    setFormatError: (format: string | null, message: string | null) =>
      setErrors(format && message ? { [format]: message } : {}),
  };
}
