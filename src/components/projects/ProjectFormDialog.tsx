'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Textarea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { ProjectDetailResponse, ProjectUpdateBody } from '@/types/project';

type EditTarget = ProjectDetailResponse['project'];


/**
 * Edit a project's own details (name, description). New projects
 * go through the wizard at /projects/new; the shared intake values are edited from
 * the project page ("Shared details") and sync to every child lot.
 */
export function ProjectFormDialog({ project, onClose }: { project: EditTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body: ProjectUpdateBody = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
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
