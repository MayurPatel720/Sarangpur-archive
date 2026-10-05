'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useRowAssign } from '@/hooks/useRowAssign';
import { buildAssignPayload, formatFromTaskError } from '@/lib/row-assign';
import { todayIso } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { RowAssignButton } from '@/components/tasks/RowAssignButton';
import { RowAssignDialog } from '@/components/tasks/RowAssignDialog';
import {
  EMPTY_LINE,
  MediaStep,
  buildMediaLines,
  emptyDraft,
  useIntakeDraft,
  validateMedia,
  type StepCtx,
} from '@/components/lots/intake-steps';

/**
 * Admin adds more media to a project. A format that already has a lot appends to
 * it (while that lot is still in Intake); a new format creates a new child lot,
 * which can be assigned from its row (Assign button). A format that already has a
 * lot shows who owns it, read-only — it is never assigned a second time.
 */
export function AddMediaDialog({
  projectId,
  existingFormats,
  existingLots = [],
  onClose,
}: {
  projectId: string;
  existingFormats: string[];
  /** Owner of each existing format's lot, for the read-only chip. */
  existingLots?: { format: string; assigneeName: string | null }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const rowAssign = useRowAssign();
  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() =>
    emptyDraft(EMPTY_LINE, ''),
  );
  const [error, setError] = useState<string | null>(null);
  const ctx: StepCtx = { mode: 'project', draft, patch, errors: fieldErrors, clearPrefix, newRowId };

  const newFormats = [...new Set(draft.lines.map((l) => l.format))].filter((f) => !existingFormats.includes(f));

  const add = useMutation({
    mutationFn: () =>
      projectsApi.addMedia(projectId, {
        mediaLines: buildMediaLines(draft),
        // Only NEW formats can be assigned; an existing format's lot keeps its owner.
        ...buildAssignPayload(rowAssign.drafts, newFormats, rowAssign.canAssignTasks),
        today: todayIso(),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      const created = res.lots.filter((l) => l.created).length;
      toast.success('Media added', created ? `${created} new ${created === 1 ? 'lot' : 'lots'} created` : 'Added to existing lots');
      onClose();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not add media.';
      setError(message);
      const bad = formatFromTaskError(message, newFormats);
      if (bad) {
        rowAssign.setFormatError(bad, message);
        rowAssign.open(bad);
      }
    },
  });

  const submit = () => {
    const errs = validateMedia(draft);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Fix the highlighted rows first.');
      return;
    }
    setError(null);
    add.mutate();
  };

  return (
    <Dialog
      title="Add media"
      subtitle="Existing formats append to their lot (while it is in Intake). A new format creates a new lot."
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-3.5">
        <MediaStep
          ctx={ctx}
          rowActions={(line) => {
            const existing = existingLots.find((l) => l.format === line.format);
            // A format listed in existingFormats but missing from existingLots still counts as taken.
            const locked = existing
              ? { name: existing.assigneeName }
              : existingFormats.includes(line.format)
                ? { name: null }
                : undefined;
            return (
              <RowAssignButton
                format={line.format}
                draft={rowAssign.drafts[line.format]}
                locked={locked}
                error={rowAssign.errors[line.format]}
                onOpen={() => rowAssign.open(line.format)}
              />
            );
          }}
        />
        <FormError message={error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="button" disabled={add.isPending} onClick={submit}>
            {add.isPending ? 'Adding…' : 'Add media'}
          </PrimaryButton>
        </div>
      </div>
      {rowAssign.editing ? (
        <RowAssignDialog
          initial={rowAssign.drafts[rowAssign.editing] ?? null}
          canAssignTasks={rowAssign.canAssignTasks}
          serverError={rowAssign.errors[rowAssign.editing]}
          onSave={(d) => rowAssign.save(rowAssign.editing!, d)}
          onClear={rowAssign.drafts[rowAssign.editing] ? () => rowAssign.clear(rowAssign.editing!) : undefined}
          onClose={rowAssign.close}
        />
      ) : null}
    </Dialog>
  );
}
