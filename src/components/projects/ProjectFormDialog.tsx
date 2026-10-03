'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import type { ProjectDetailResponse, ProjectUpdateBody } from '@/types/project';

type EditTarget = ProjectDetailResponse['project'];

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');
const toApiDate = (input: string): string | null =>
  input ? new Date(`${input}T00:00:00`).toISOString() : null;

/**
 * Edit a project's own details (name, description, coordinator, dates). New projects
 * go through the wizard at /projects/new; the shared intake values are edited from
 * the project page ("Shared details") and sync to every child lot.
 */
export function ProjectFormDialog({ project, onClose }: { project: EditTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useUserPicker();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [coordinatorId, setCoordinatorId] = useState(project.coordinatorId ?? '');
  const [startDate, setStartDate] = useState(toDateInput(project.startDate));
  const [targetDate, setTargetDate] = useState(toDateInput(project.targetDate));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body: ProjectUpdateBody = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        coordinatorId: coordinatorId ? coordinatorId : null,
        startDate: toApiDate(startDate),
        targetDate: toApiDate(targetDate),
      };
      return projectsApi.update(project.id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success('Project updated', name.trim());
      onClose();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not save the project.';
      setError(message);
      toast.error('Could not update project', message);
    },
  });

  const userOptions = users.data?.users ?? [];
  const canSubmit = name.trim() !== '' && !save.isPending;

  return (
    <Dialog
      title={`Edit ${project.code}`}
      subtitle="The project code is immutable and cannot be edited."
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <Field label="Name" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dwarka camp digitization"
            maxLength={160}
            aria-label="Project name"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this project covers…"
            rows={3}
            aria-label="Project description"
          />
        </Field>
        <Field label="Coordinator" hint="Informational — who runs this project.">
          <Select value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)} aria-label="Project coordinator">
            <option value="">No coordinator</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Start date">
            <DatePicker value={startDate} onChange={setStartDate} aria-label="Project start date" />
          </Field>
          <Field label="Target date">
            <DatePicker value={targetDate} onChange={setTargetDate} aria-label="Project target date" />
          </Field>
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
