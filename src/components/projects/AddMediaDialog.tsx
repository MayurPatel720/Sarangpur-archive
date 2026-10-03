'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useUserPicker } from '@/hooks/useUserPicker';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
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
 * which can be assigned right here.
 */
export function AddMediaDialog({
  projectId,
  existingFormats,
  onClose,
}: {
  projectId: string;
  existingFormats: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useUserPicker();
  const formats = useReferenceList('format');
  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() =>
    emptyDraft(EMPTY_LINE, ''),
  );
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const ctx: StepCtx = { mode: 'project', draft, patch, errors: fieldErrors, clearPrefix, newRowId };

  const newFormats = [...new Set(draft.lines.map((l) => l.format))].filter((f) => !existingFormats.includes(f));
  const formatLabel = (f: string) => formats.data?.items.find((i) => i.value === f)?.label ?? f;

  const add = useMutation({
    mutationFn: () =>
      projectsApi.addMedia(projectId, {
        mediaLines: buildMediaLines(draft),
        assignments: newFormats.filter((f) => assignees[f]).map((f) => ({ format: f, assigneeId: assignees[f]! })),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      const created = res.lots.filter((l) => l.created).length;
      toast.success('Media added', created ? `${created} new ${created === 1 ? 'lot' : 'lots'} created` : 'Added to existing lots');
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not add media.'),
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
        <MediaStep ctx={ctx} />
        {newFormats.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">New lots — assign</span>
            {newFormats.map((f) => (
              <Field key={f} label={`${formatLabel(f)} lot`}>
                <Select
                  value={assignees[f] ?? ''}
                  onChange={(e) => setAssignees((prev) => ({ ...prev, [f]: e.target.value }))}
                  aria-label={`Assignee for the new ${formatLabel(f)} lot`}
                >
                  <option value="">Unassigned (admin only)</option>
                  {(users.data?.users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        ) : null}
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
    </Dialog>
  );
}
